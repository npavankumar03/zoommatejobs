(function attachAtsDetector(root) {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function detectJobPage(url, documentRef) {
    const lowerUrl = normalizeText(url);

    const patterns = [
      { type: "GREENHOUSE", tokens: ["greenhouse.io/application", "boards.greenhouse.io", "job-boards.greenhouse.io"] },
      { type: "LEVER", tokens: ["jobs.lever.co"] },
      { type: "WORKDAY", tokens: ["myworkdayjobs.com"] },
      { type: "ICIMS", tokens: ["icims.com/careers"] },
      { type: "ASHBY", tokens: ["ashbyhq.com"] },
      { type: "SMARTRECRUITERS", tokens: ["smartrecruiters.com"] },
      { type: "BAMBOOHR", tokens: ["bamboohr.com/careers"] }
    ];

    for (const pattern of patterns) {
      if (pattern.tokens.some((token) => lowerUrl.includes(token))) {
        return {
          isJobPage: true,
          atsType: pattern.type,
          confidence: "high"
        };
      }
    }

    const indicators = ["resume", "cover letter", "work authorization", "years of experience", "application"];
    const fields = Array.from(documentRef.querySelectorAll("input, textarea, select"));

    let hits = 0;
    for (const field of fields) {
      const label = normalizeText(field.getAttribute("aria-label") || field.getAttribute("placeholder") || "");
      if (indicators.some((token) => label.includes(token))) {
        hits += 1;
      }
    }

    if (hits >= 3) {
      return { isJobPage: true, atsType: "GENERIC", confidence: "medium" };
    }

    if (hits >= 1) {
      return { isJobPage: true, atsType: "GENERIC", confidence: "low" };
    }

    return { isJobPage: false, atsType: "UNKNOWN", confidence: "low" };
  }

  root.JobFillATSDetector = {
    detectJobPage
  };
})(typeof window !== "undefined" ? window : globalThis);
