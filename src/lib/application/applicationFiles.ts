// Catalogue of CURRENT master-refresh application files (private bucket).
// Only these paths may be served by /api/admin/application-files.
export const APPLICATION_FILES = [
  { id: "dossier-pdf", group: "Technical/Application Dossier", label: "PDF", path: "master-refresh/FlowBridge_Application_Dossier_v1.1.pdf" },
  { id: "dossier-docx", group: "Technical/Application Dossier", label: "Editable DOCX", path: "master-refresh/FlowBridge_Application_Dossier_v1.1.docx" },
  { id: "whitepaper-pdf", group: "Whitepaper", label: "PDF", path: "master-refresh/FlowBridge_Whitepaper_v1.1.pdf" },
  { id: "whitepaper-docx", group: "Whitepaper", label: "Editable DOCX", path: "master-refresh/FlowBridge_Whitepaper_v1.1.docx" },
  { id: "pitch-pdf", group: "BOT Chain Application Pitch Deck", label: "PDF", path: "master-refresh/FlowBridge_BOT_Pitch_Deck_v1.1.pdf" },
  { id: "pitch-pptx", group: "BOT Chain Application Pitch Deck", label: "Editable PPTX", path: "master-refresh/FlowBridge_BOT_Pitch_Deck_v1.1.pptx" },
  { id: "evidence-pdf", group: "On-chain Evidence Pack", label: "PDF", path: "master-refresh/FlowBridge_Onchain_Evidence_Pack_v1.1.pdf" },
  { id: "evidence-docx", group: "On-chain Evidence Pack", label: "Editable DOCX", path: "master-refresh/FlowBridge_Onchain_Evidence_Pack_v1.1.docx" },
  { id: "evidence-data", group: "On-chain Evidence Pack", label: "Evidence archive (ZIP)", path: "master-refresh/FlowBridge_Onchain_Evidence_Data_v1.1.zip" },
  { id: "reviewer-pdf", group: "Reviewer Summary", label: "PDF", path: "master-refresh/FlowBridge_Reviewer_Summary_v1.1.pdf" },
  { id: "reviewer-docx", group: "Reviewer Summary", label: "Editable DOCX", path: "master-refresh/FlowBridge_Reviewer_Summary_v1.1.docx" },
  { id: "package-zip", group: "Complete package", label: "Download complete application package (.ZIP)", path: "master-refresh/FlowBridge_Application_Package_Master_Refresh_v1.1.zip" },
] as const;

export type ApplicationFileId = (typeof APPLICATION_FILES)[number]["id"];
export function findApplicationFile(id: string) {
  return APPLICATION_FILES.find((f) => f.id === id) ?? null;
}
