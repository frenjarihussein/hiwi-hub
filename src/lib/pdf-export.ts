/** Renders an on-screen element to a real A4 PDF file and downloads it — no print dialog. */
export async function downloadElementPdf(el: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth() - 20;
  const ph = pdf.internal.pageSize.getHeight() - 20;
  const sliceH = Math.floor((canvas.width * ph) / pw);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = Math.min(sliceH, canvas.height - y);
    part.getContext("2d")!.drawImage(canvas, 0, -y);
    if (page > 0) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.95), "JPEG", 10, 10, pw, (part.height * pw) / part.width);
  }
  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
