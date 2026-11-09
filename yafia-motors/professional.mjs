import {professionalHe} from './professional-he.mjs';
import {professionalAr} from './professional-ar.mjs';
import {articleKnowledge} from './professional-articles.mjs';

export const technicalSources={
 'chevy-maintenance':{name:'Chevrolet — Maintenance & care',url:'https://www.chevrolet.com/certified-service/maintenance'},
 'chevy-schedule':{name:'Chevrolet — Vehicle maintenance schedules',url:'https://www.chevrolet.com/support/vehicle/maintenance/schedule/about-ice'},
 'ford-inspection':{name:'Ford — Multi-point inspection items',url:'https://fordprotect.ford.com/premium-maintenance-plan'},
 'ford-intervals':{name:'Ford — Service intervals',url:'https://www.ford.co.uk/owner/service-and-maintenance/servicing/service-intervals'},
 'bosch-obd':{name:'Bosch — Diagnostic codes, live data & freeze frame',url:'https://www.boschdiagnostics.com/products/bosch-obd-1050-mobile-scan-diagnostics'},
 'bosch-manual':{name:'Bosch — OBD1200 technical manual',url:'https://cdr.boschdiagnostics.com/diy/sites/diy/files/573685_obd1200_mnl_en_rev_b.pdf'},
 'chevy-diagnostics':{name:'Chevrolet — Diagnostic alerts',url:'https://www.chevrolet.com/support/vehicle/maintenance/repair-and-service/diagnostic-alerts'},
 'motorservice-installation':{name:'Motorservice — Engine installation and initial start-up',url:'https://www.ms-motorservice.com/tr/en/technipedia/engine-installation-and-initial-start-up-503'},
 'motorservice-oiling':{name:'Motorservice — Initial lubrication of reconditioned engines',url:'https://www.ms-motorservice.com/int/en/technipedia/pressure-oil-filling-on-reconditioned-engines-496'},
 'chevy-installation':{name:'Chevrolet Performance — Model-specific installation guides',url:'https://www.chevrolet.com/performance-parts/owners-support/installation-guides'},
 'zf-oil':{name:'ZF Aftermarket — Transmission oil service',url:'https://aftermarket.zf.com/sg/aftermarket-portal/for-workshops/useful-tips/transmission-oil-change-pc/'},
 'zf-service':{name:'ZF — Transmission maintenance, repair & replacement',url:'https://press.zf.com/press/media/en/press_media/2026/01_global_en_and_de_3/releases_13/2026_02_19_zfa_oil_change/tx2026-02-19_ZFA_Oil_Change_EN.pdf'},
 'ford-transmission':{name:'Ford — Transmission maintenance schedule',url:'https://www.ford.co.uk/support/how-tos/owner-resources/vehicle-maintenance/what-maintenance-is-required-on-the-transmission'},
 'brembo-thickness':{name:'Brembo — Brake disc thickness and wear',url:'https://www.bremboparts.com/europe/en/support/car/maintenance/minimum-brake-disc-thickness-212337'},
 'brembo-check':{name:'Brembo — Brake inspection and bedding in',url:'https://www.bremboparts.com/europe/en/support/car/maintenance/indications-and-bedding-in-90374'},
 'chevy-brakes':{name:'Chevrolet — Brake system care',url:'https://www.chevrolet.com/support/vehicle/driving-safety/brakes/brakes-system'},
 'gates-cooling':{name:'Gates — Cooling system troubleshooting and coolant specifications',url:'https://www.gatesaustralia.com.au/-/media/files/gates-au/automotive/catalogues/cooling-system-troubleshooting-manual-ausnz-august-2020.pdf?hash=414F365DB6CA4A98C1902EF1DFB934A7EB7D0E86&la=en'},
 'gates-pressure':{name:'Gates — Cooling system pressure testing',url:'https://www.gatesaustralia.com.au/products/automotive/passenger-car-and-light-truck/cooling-system/pressure-caps-and-pressure-tester/cooling-system-pressure-tester'},
 'valeo-radiator':{name:'Valeo — Radiator diagnosis',url:'https://www.valeoservice.ae/en-ae/techassist/technical-library/technical-documents/radiator-diagnosis'},
 'chevy-warning':{name:'Chevrolet — Dashboard warning lights',url:'https://www.chevrolet.com/support/vehicle/dashboard-lights-signals/warning-lights'},
 'chevy-manuals':{name:'Chevrolet — Manuals by model and year',url:'https://www.chevrolet.com/support/vehicle/manuals-guides'},
 'chevy-oil':{name:'Chevrolet — Engine oil and pressure warnings',url:'https://www.chevrolet.com/support/vehicle/under-the-hood/engine-oil'},
 'chevy-oil-level':{name:'Chevrolet — Oil level versus oil life',url:'https://www.chevrolet.com/support/quick-start-guides/oil-level'},
 'gm-oil-messages':{name:'General Motors — Oil level, oil life and oil pressure messages',url:'https://contentdelivery.ext.gm.com/content/dam/cope/en_us/public/pdf_assets/active/owners_manuals_browse/2k15cts2ndPrint.pdf'}
};

export function enrichProfessionalContent(services,articles){
 for(const service of services){
  service.knowledge={he:professionalHe[service.slug],ar:professionalAr[service.slug]};
  if(!service.knowledge.he||!service.knowledge.ar)throw Error('Missing professional service copy: '+service.slug);
 }
 const articleLinks={'american-car-maintenance':['maintenance','american-cars'],'transmission-service-guide':['transmission','diagnostics'],'engine-oil-warning':['diagnostics','maintenance']};
 for(const article of articles){article.knowledge=articleKnowledge[article.slug];for(const lang of ['he','ar'])article.knowledge[lang].related=articleLinks[article.slug];}
 for(const item of [...services,...articles])for(const lang of ['he','ar']){
  const knowledge=item.knowledge[lang];
  if(new Set(knowledge.sections.map(s=>s.id)).size!==knowledge.sections.length)throw Error('Duplicate section anchor: '+item.slug);
  for(const key of knowledge.sources)if(!technicalSources[key])throw Error('Unknown source: '+key);
 }
}
