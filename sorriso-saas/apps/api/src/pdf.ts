import PDFDocument from 'pdfkit';

export interface QuoteItem { description: string; price: number }
export interface PdfInput {
  clinicName: string;
  brandColor: string;
  logo?: Buffer;
  patientName: string;
  treatmentLabel: string;
  before: Buffer;
  after: Buffer;
  items: QuoteItem[];
  validityDays: number;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function buildPdf(i: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = doc.page.width - 96;
    if (i.logo) doc.image(i.logo, 48, 40, { fit: [120, 48] });
    doc.fillColor('#000').fontSize(18).font('Helvetica-Bold')
      .text(i.clinicName, 48, 48, { width: w, align: 'right' });
    doc.moveTo(48, 100).lineTo(48 + w, 100).lineWidth(2).strokeColor(i.brandColor).stroke();

    doc.fillColor('#000').fontSize(13).font('Helvetica-Bold').text('Simulação de tratamento', 48, 116);
    doc.font('Helvetica').fontSize(11)
      .text(`Paciente: ${i.patientName}`, 48, 136)
      .text(`Tratamento: ${i.treatmentLabel}`);

    const colW = (w - 16) / 2, y = 180;
    doc.font('Helvetica-Bold').fontSize(10).text('ANTES', 48, y).text('DEPOIS', 48 + colW + 16, y);
    doc.image(i.before, 48, y + 16, { fit: [colW, 200] });
    doc.image(i.after, 48 + colW + 16, y + 16, { fit: [colW, 200] });

    let cy = y + 236;
    doc.font('Helvetica-Bold').fontSize(13).text('Orçamento', 48, cy);
    cy += 22;
    doc.font('Helvetica').fontSize(11);
    let total = 0;
    for (const it of i.items) {
      doc.text(it.description, 48, cy, { width: w - 120 });
      doc.text(brl(it.price), 48 + w - 110, cy, { width: 110, align: 'right' });
      total += it.price;
      cy += 20;
    }
    doc.moveTo(48, cy).lineTo(48 + w, cy).lineWidth(1).strokeColor('#000').stroke();
    cy += 8;
    doc.font('Helvetica-Bold').text('Total', 48, cy)
      .text(brl(total), 48 + w - 110, cy, { width: 110, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#444')
      .text(`Orçamento válido por ${i.validityDays} dias.`, 48, cy + 26);

    doc.fontSize(8).fillColor('#444').text(
      'A imagem “Depois” é uma simulação ilustrativa gerada por computador e não garante o resultado ' +
      'do tratamento, que depende de avaliação clínica individual. Seus dados e imagens são tratados ' +
      'conforme a LGPD, para a finalidade consentida, e podem ser excluídos a seu pedido.',
      48, doc.page.height - 90, { width: w },
    );
    doc.end();
  });
}
