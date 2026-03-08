from __future__ import annotations

import json
from typing import Any

SYSTEM_PROMPT = """You are an expert job application assistant with deep knowledge of ATS systems
(Greenhouse, Workday, Lever, iCIMS, Ashby, SmartRecruiters).

Rules:
- Always return ONLY valid JSON. No explanation, no markdown, no extra text.
- Never leave a required field empty if user has relevant data.
- For open-ended questions write professional personalized answers using the
  job description and user profile. Never write generic answers.
- For fields you cannot fill confidently, set value to null.
- For dropdowns return exact option text from the choices list.
- Never fabricate information not in the user profile."""

_GEMINI_JSON_SUFFIX = "Respond ONLY with valid JSON, no markdown."


def _json_block(data: Any) -> str:
    return json.dumps(data, indent=2, default=str, ensure_ascii=False)


def build_form_fill_prompt(
    fields: list[dict[str, Any]] | list[Any],
    user_profile: dict[str, Any] | Any,
    job_description: str | None,
    job_title: str | None,
    company_name: str | None,
) -> str:
    payload = {
        "job": {
            "title": job_title or "",
            "companyName": company_name or "",
            "description": job_description or "",
        },
        "userProfile": user_profile or {},
        "detectedFields": fields or [],
    }

    return f"""Task: Fill this job application form from the provided candidate profile and job context.

Use this data:
{_json_block(payload)}

Field instructions:
- text/email/tel/url: return exact string values.
- textarea: return a thoughtful, job-specific paragraph personalized to THIS role.
- select/dropdown: return EXACT option text from availableOptions only.
- radio: return the exact option value that matches the candidate.
- checkbox: return true or false.
- date: return YYYY-MM-DD.
- file: return null (handled separately).

Special handling:
- "Why do you want to work here?": 2-3 sentences referencing company, role, and user experience.
- "Tell us about yourself": 3-4 sentence professional summary.
- "Cover letter": full letter under 300 words, no clichés.
- "Years of experience": calculate from work history dates.
- "Salary expectations": use expectedSalary from profile.
- "Work authorization": use workAuthorization from profile.
- "Willing to relocate": use willingToRelocate from profile.

Output format (array only):
[
  {{
    "xpath": "...",
    "field_label": "...",
    "value": "...",
    "confidence": "high"
  }}
]

Allowed confidence values: "high", "medium", "low".

{_GEMINI_JSON_SUFFIX}"""


def build_resume_tuning_prompt(
    resume_text: str | None,
    job_description: str | None,
    job_title: str | None,
    company_name: str | None,
) -> str:
    payload = {
        "job": {
            "title": job_title or "",
            "companyName": company_name or "",
            "description": job_description or "",
        },
        "resumeText": resume_text or "",
    }

    return f"""Task: Optimize this resume for ATS matching against the target job.

Use this data:
{_json_block(payload)}

Return strict JSON:
{{
  "atsScore": 0,
  "missingKeywords": [],
  "presentKeywords": [],
  "improvedBullets": [
    {{"original": "...", "improved": "..."}}
  ],
  "summarySuggestion": "...",
  "overallFeedback": "..."
}}

Rules:
- atsScore must be an integer from 0 to 100.
- missingKeywords and presentKeywords must contain relevant role-specific keywords only.
- improvedBullets should rewrite weak bullets with measurable impact where possible.
- Keep output concise, useful, and specific to the provided job description.

{_GEMINI_JSON_SUFFIX}"""


def build_cover_letter_prompt(
    user_profile: dict[str, Any] | Any,
    job_description: str | None,
    job_title: str | None,
    company_name: str | None,
) -> str:
    payload = {
        "job": {
            "title": job_title or "",
            "companyName": company_name or "",
            "description": job_description or "",
        },
        "userProfile": user_profile or {},
    }

    return f"""Write a tailored cover letter for this role using the data below.

Use this data:
{_json_block(payload)}

Rules:
- Under 300 words.
- No clichés (for example "hardworking team player").
- Reference 1-2 specific details from the job description.
- Mention 1 specific achievement from work history.
- Do NOT start with "I am writing to apply...".
- End with a confident call to action.

Return JSON:
{{
  "coverLetter": "plain text cover letter"
}}

The coverLetter value must be plain text only (no markdown).

{_GEMINI_JSON_SUFFIX}"""


def build_field_identification_prompt(html_snippet: str) -> str:
    return f"""Analyze this HTML snippet and identify all form fields.

HTML:
{html_snippet}

Return strict JSON array:
[
  {{
    "xpath": "...",
    "fieldType": "...",
    "label": "...",
    "isRequired": true,
    "availableOptions": []
  }}
]

Rules:
- Include input, textarea, select, radio, checkbox, and file fields.
- Infer labels from <label>, aria-label, aria-labelledby, placeholder, and nearby text.
- availableOptions must be an array of option labels for select/radio; otherwise [].
- isRequired should be true when required attributes or required indicators are present.

{_GEMINI_JSON_SUFFIX}"""
