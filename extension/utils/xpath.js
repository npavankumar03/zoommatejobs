(function attachXPathUtils(root) {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getXPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    if (el.id) {
      return `//*[@id="${el.id.replace(/"/g, "\\\"")}"]`;
    }

    const segments = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) break;

      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tagName}[${index}]`);
      current = parent;
    }

    return `/html/body/${segments.join("/")}`;
  }

  function getElementByXPath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  function getLabel(el) {
    if (!el) return "";

    if (el.labels && el.labels[0]) {
      const text = normalizeText(el.labels[0].textContent);
      if (text) return text;
    }

    const ariaLabel = normalizeText(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;

    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelled = ariaLabelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => normalizeText(node.textContent))
        .join(" ")
        .trim();

      if (labelled) return labelled;
    }

    const placeholder = normalizeText(el.getAttribute("placeholder"));
    if (placeholder) return placeholder;

    const nearestLabel = el.closest("label");
    if (nearestLabel) {
      const text = normalizeText(nearestLabel.textContent);
      if (text) return text;
    }

    const nearby = el.parentElement;
    if (nearby) {
      const labelLike = Array.from(nearby.querySelectorAll("label, span, div, p"))
        .map((node) => normalizeText(node.textContent))
        .find((text) => text && text.length < 120);

      if (labelLike) return labelLike;
    }

    return "";
  }

  root.JobFillXPath = {
    getXPath,
    getElementByXPath,
    getLabel
  };
})(typeof window !== "undefined" ? window : globalThis);
