export const dashboardSections = ['resumo','dinheiro','rendas','pagamentos','agenda','despesas','mensais','viagens','whatsapp','feedback','uso','mais'] as const;
export type DashboardSection = typeof dashboardSections[number];

export function dashboardSectionFromHash(hash: string): DashboardSection {
 const section = hash.replace(/^#/, '');
 return dashboardSections.includes(section as DashboardSection) ? section as DashboardSection : 'resumo';
}

export const primaryNavigation = [
 {id:'resumo',label:'Início'},
 {id:'dinheiro',label:'Dinheiro'},
 {id:'pagamentos',label:'Contas'},
 {id:'agenda',label:'Agenda'},
 {id:'mais',label:'Mais'},
] as const;
export const mobileShortcuts=primaryNavigation;
export type DashboardGroup=typeof primaryNavigation[number]['id'];
const groups:Record<DashboardSection,DashboardGroup>={resumo:'resumo',dinheiro:'dinheiro',rendas:'dinheiro',pagamentos:'pagamentos',despesas:'pagamentos',mensais:'pagamentos',viagens:'pagamentos',agenda:'agenda',whatsapp:'mais',feedback:'mais',uso:'mais',mais:'mais'};
export const dashboardGroup=(section:DashboardSection):DashboardGroup=>groups[section];
export const groupedSections={
 dinheiro:[{id:'dinheiro',label:'Saldo e salário'},{id:'rendas',label:'Renda extra'}],
 pagamentos:[{id:'pagamentos',label:'A pagar'},{id:'despesas',label:'Gastos'},{id:'mensais',label:'Fixas'},{id:'viagens',label:'Viagens'}],
} as const;
