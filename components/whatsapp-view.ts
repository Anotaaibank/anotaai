export type WhatsappAccessStatus = 401 | 402 | 403;
export type WhatsappViewResponse<T> =
  | {kind: 'ok'; epoch: number; data: T}
  | {kind: 'error'; epoch: number; message: string}
  | {kind: 'stale' | 'denied'; epoch: number};

/** A view lifetime, not an authorization boundary. The server still authorizes every request. */
export function createWhatsappView<T>(onDenied: (status: WhatsappAccessStatus) => void, transport: typeof fetch = fetch) {
  let epoch = 0, active = false, blocked = false;
  const pending = new Set<AbortController>();
  const current = (value: number) => active && !blocked && value === epoch;
  const suspend = () => {
    active = false; epoch++;
    for (const controller of pending) controller.abort();
    pending.clear();
  };
  return {
    current, checkpoint: () => epoch,
    activate() {if (active || blocked) return false; active = true; epoch++; return true;},
    suspend,
    async run(init: RequestInit = {}): Promise<WhatsappViewResponse<T>> {
      const at = epoch;
      if (!current(at)) return {kind: 'stale', epoch: at};
      const controller = new AbortController(); pending.add(controller);
      try {
        const response = await transport('/api/whatsapp', {...init, cache: 'no-store', signal: controller.signal});
        if (!current(at)) return {kind: 'stale', epoch: at};
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          blocked = true; suspend(); onDenied(response.status);
          return {kind: 'denied', epoch: at};
        }
        const data = await response.json();
        if (!current(at)) return {kind: 'stale', epoch: at};
        if (!response.ok) return {kind: 'error', epoch: at, message: typeof data?.error === 'string' ? data.error : 'Não foi possível concluir.'};
        return {kind: 'ok', epoch: at, data: data as T};
      } catch {
        if (!current(at)) return {kind: 'stale', epoch: at};
        return {kind: 'error', epoch: at, message: 'Sem resposta. Confira o histórico antes de repetir uma ação.'};
      } finally {pending.delete(controller);}
    },
  };
}

export function whatsappAccessMessage(status: WhatsappAccessStatus) {
  if (status === 402) return 'Confira sua assinatura para voltar a acessar o WhatsApp no aplicativo.';
  return status === 401 ? 'Sua sessão terminou. Entre novamente.' : 'Seu acesso mudou. Entre novamente para continuar.';
}

export function whatsappSender(sender: string, participants: readonly {phone: string; subscriber_name?: string}[] = []) {
  const digits = sender.replace(/\D/g, '');
  const name = participants.find(person => person.phone.replace(/\D/g, '') === digits)?.subscriber_name?.trim();
  return {name: name || null, masked: digits.length >= 4 ? '•••• ' + digits.slice(-4) : 'Número indisponível'};
}
