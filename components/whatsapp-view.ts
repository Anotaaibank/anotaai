export type WhatsappAccessStatus = 401 | 402 | 403 | 'IDENTITY';
type ViewPosition = {epoch: number; sequence: number};
export type WhatsappViewResponse<T> = ViewPosition & (
  | {kind: 'ok'; data: T}
  | {kind: 'error'; message: string}
  | {kind: 'stale' | 'denied'});

/** A view lifetime, not an authorization boundary. The server still authorizes every request. */
export function createWhatsappView<T>(onDenied: (status: WhatsappAccessStatus) => void, transport: typeof fetch = fetch) {
  let epoch = 0, sequence = 0, active = false, blocked = false, viewer: string | null = null;
  const pending = new Set<AbortController>();
  const current = (value: number, responseSequence?: number) => active && !blocked && value === epoch && (responseSequence === undefined || responseSequence === sequence);
  const suspend = () => {
    active = false; epoch++;
    for (const controller of pending) controller.abort();
    pending.clear();
  };
  const deny = (status: WhatsappAccessStatus) => {blocked = true; suspend(); onDenied(status);};
  return {
    current, checkpoint: () => epoch,
    activate() {if (active || blocked) return false; active = true; epoch++; return true;},
    suspend,
    async run(init: RequestInit = {}): Promise<WhatsappViewResponse<T>> {
      const at = epoch;
      if (!current(at)) return {kind: 'stale', epoch: at, sequence};
      const order = ++sequence, position = {epoch: at, sequence: order};
      const controller = new AbortController(); pending.add(controller);
      try {
        const response = await transport('/api/whatsapp', {...init, cache: 'no-store', signal: controller.signal});
        if (!current(at)) return {kind: 'stale', ...position};
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          deny(response.status); return {kind: 'denied', ...position};
        }
        let data;
        try {data = await response.json();}
        catch {
          if (!current(at)) return {kind: 'stale', ...position};
          if (response.ok) {deny('IDENTITY'); return {kind: 'denied', ...position};}
          return current(at, order) ? {kind: 'error', ...position, message: 'Não foi possível concluir.'} : {kind: 'stale', ...position};
        }
        if (!current(at)) return {kind: 'stale', ...position};
        if (response.ok) {
          const nextViewer = typeof data?.viewer_id === 'string' && data.viewer_id.trim() === data.viewer_id && data.viewer_id.length > 0 ? data.viewer_id : null;
          // Check identity even on an older success in this lifetime, before any payload/draft is exposed.
          if (!nextViewer || (viewer !== null && viewer !== nextViewer)) {deny('IDENTITY'); return {kind: 'denied', ...position};}
          viewer ??= nextViewer;
        }
        if (!current(at, order)) return {kind: 'stale', ...position};
        if (!response.ok) return {kind: 'error', ...position, message: typeof data?.error === 'string' ? data.error : 'Não foi possível concluir.'};
        return {kind: 'ok', ...position, data: data as T};
      } catch {
        if (!current(at, order)) return {kind: 'stale', ...position};
        return {kind: 'error', ...position, message: 'Sem resposta. Confira o histórico antes de repetir uma ação.'};
      } finally {pending.delete(controller);}
    },
  };
}

export function whatsappAccessMessage(status: WhatsappAccessStatus) {
  if (status === 'IDENTITY') return 'A conta mudou ou não pôde ser confirmada. Entre novamente.';
  if (status === 402) return 'Confira sua assinatura para voltar a acessar o WhatsApp no aplicativo.';
  return status === 401 ? 'Sua sessão terminou. Entre novamente.' : 'Seu acesso mudou. Entre novamente para continuar.';
}

export function whatsappSender(sender: string, participants: readonly {phone: string; subscriber_name?: string}[] = []) {
  const digits = sender.replace(/\D/g, '');
  const name = participants.find(person => person.phone.replace(/\D/g, '') === digits)?.subscriber_name?.trim();
  return {name: name || null, masked: digits.length >= 4 ? '•••• ' + digits.slice(-4) : 'Número indisponível'};
}
