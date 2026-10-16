export const dashboardSections = ['resumo','dinheiro','rendas','pagamentos','agenda','despesas','mensais','viagens','whatsapp','feedback','uso'] as const;
export type DashboardSection = typeof dashboardSections[number];

export function dashboardSectionFromHash(hash: string): DashboardSection {
 const section = hash.replace(/^#/, '');
 return dashboardSections.includes(section as DashboardSection) ? section as DashboardSection : 'resumo';
}

export const mobileShortcuts = [
 {id:'resumo',label:'Início'},
 {id:'dinheiro',label:'Dinheiro'},
 {id:'agenda',label:'Agenda'},
 {id:'pagamentos',label:'Contas'},
] as const;
