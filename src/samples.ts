/** Synthetic fixtures: answers manually checked against the passages below.
 * These illustrate source navigation, not measured model performance. */
export const samples = {
  construction: {
    sector: "Construction",
    name: "Elm Street · sample contract",
    kind: "CONTRACT EXCERPT",
    heading: "04 / Submittal requirements",
    question: "When are the shop drawings due?",
    answer:
      "The contractor must submit shop drawings within 14 calendar days of the notice to proceed.",
    passage:
      "The contractor shall submit shop drawings within 14 calendar days of the notice to proceed. The project manager will acknowledge receipt within two business days.",
    context:
      "Elm Street Community Hall — synthetic example. This excerpt demonstrates finding contract terms, not engineering or safety approval.",
  },
  finance: {
    sector: "Finance",
    name: "Northstar · sample annual report",
    kind: "REPORT EXCERPT",
    heading: "02 / Revenue overview",
    question: "What revenue does the report disclose?",
    answer:
      "The sample report states revenue of $1.2 million for 2025. This is a reported figure, not an investment recommendation.",
    passage:
      "Revenue for the year ended December 31, 2025 was $1.2 million. Operating expenses for the same period were $900,000.",
    context:
      "Northstar Studio — synthetic company and figures. This is not a real financial disclosure.",
  },
  healthcare: {
    sector: "Healthcare",
    name: "Walking study · sample abstract",
    kind: "RESEARCH EXCERPT",
    heading: "01 / Study design",
    question: "How many volunteers took part?",
    answer:
      "The fictional study enrolled 120 adult volunteers. The excerpt does not establish clinical effectiveness or support treatment advice.",
    passage:
      "This fictional observational study enrolled 120 adult volunteers over an eight-week period to record self-reported walking duration. No patient records are included in this example.",
    context:
      "Synthetic research abstract for interface demonstration only. No real participants or patient data.",
  },
} as const;
export type SampleKey = keyof typeof samples;
