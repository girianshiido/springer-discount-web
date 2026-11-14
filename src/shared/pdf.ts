import { jsPDF } from 'jspdf';
export function createUrlPdf(input: string[], scope='Toutes les URL de livres découvertes'): jsPDF {
  const urls=[...new Set(input.filter(raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&['link.springer.com','link.springernature.com'].includes(u.hostname)&&u.pathname.startsWith('/book/');}catch{return false;}}))].sort();
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
  doc.setProperties({title:'Adresses des livres Springer',subject:scope,creator:'Springer Discount Finder'});
  let y=38;
  function header() {doc.setTextColor(30,73,53);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('Adresses des livres Springer',18,20);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`${urls.length} adresses uniques - ${scope}`,18,28);}
  header();doc.setFontSize(9);
  for(let i=0;i<urls.length;i++) {
    const url=urls[i]!;const lines=doc.splitTextToSize(`${i+1}. ${url}`,174) as string[];
    if (y+lines.length*5+3>278) {doc.addPage();header();y=38;}
    doc.setTextColor(30,73,53);
    for(const line of lines) {
      if(y+5>278){doc.addPage();header();y=38;}
      doc.textWithLink(line,18,y,{url});y+=5;
    }
    y+=3;
  }
  if(!urls.length)doc.text('Aucune adresse dans ce relevé.',18,y);
  const total=doc.getNumberOfPages();
  for(let page=1;page<=total;page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor(90);doc.text(`Springer Discount Finder - ${page} / ${total}`,18,289);}
  return doc;
}
