"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ResumeUploader, type ResumeUploadResult } from "@/components/ResumeUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsList } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";

type ProfilePayload = {
  user: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    websiteUrl?: string | null;
    expectedSalary?: number | null;
    workAuthorization?: string | null;
    requiresSponsorship?: boolean;
    willingToRelocate?: boolean;
    totalYearsExperience?: number | null;
    personalBio?: string | null;
    resumeSummary?: string | null;
    resumeText?: string | null;
    resumeFileName?: string | null;
    resumeFilePath?: string | null;
  };
  workHistory: Array<{
    id: string;
    company: string;
    title: string;
    location?: string | null;
    startDate: string;
    endDate?: string | null;
    isCurrent: boolean;
    description?: string | null;
    technologies: string[];
  }>;
  education: Array<{
    id: string;
    school: string;
    degree: string;
    fieldOfStudy?: string | null;
    graduationYear?: number | null;
    gpa?: string | null;
  }>;
  skills: Array<{
    id: string;
    name: string;
    level: "BEGINNER" | "INTERMEDIATE" | "EXPERT";
  }>;
};

type BasicForm = {
  fullName: string;
  phone: string;
  location: string;
  workAuthorization: string;
  expectedSalary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  websiteUrl: string;
  totalYearsExperience: string;
  personalBio: string;
  resumeSummary: string;
};

const TAB_ITEMS = [
  { id: "basic", label: "Basic Info" },
  { id: "work", label: "Work History" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "resume", label: "Resume" }
];

const ATS_KEYWORDS = [
  "python",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "sql",
  "docker",
  "kubernetes",
  "aws",
  "api",
  "testing",
  "ci/cd"
];

function asDateInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function defaultBasicForm(user: ProfilePayload["user"] | null): BasicForm {
  return {
    fullName: user?.fullName ?? "",
    phone: user?.phone ?? "",
    location: user?.location ?? "",
    workAuthorization: user?.workAuthorization ?? "",
    expectedSalary: user?.expectedSalary ? String(user.expectedSalary) : "",
    linkedinUrl: user?.linkedinUrl ?? "",
    githubUrl: user?.githubUrl ?? "",
    portfolioUrl: user?.portfolioUrl ?? "",
    websiteUrl: user?.websiteUrl ?? "",
    totalYearsExperience: user?.totalYearsExperience ? String(user.totalYearsExperience) : "",
    personalBio: user?.personalBio ?? "",
    resumeSummary: user?.resumeSummary ?? ""
  };
}

export function ProfileForm() {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [basicForm, setBasicForm] = useState<BasicForm>(defaultBasicForm(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingBasic, setIsSavingBasic] = useState(false);

  const [workForm, setWorkForm] = useState({
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    description: "",
    technologies: ""
  });

  const [educationForm, setEducationForm] = useState({
    school: "",
    degree: "",
    fieldOfStudy: "",
    graduationYear: "",
    gpa: ""
  });

  const [skillInput, setSkillInput] = useState("");
  const [skillLevel, setSkillLevel] = useState<"BEGINNER" | "INTERMEDIATE" | "EXPERT">("INTERMEDIATE");

  const resumeText = profile?.user.resumeText ?? "";
  const keywordAnalysis = useMemo(() => {
    const normalized = resumeText.toLowerCase();
    const present = ATS_KEYWORDS.filter((keyword) => normalized.includes(keyword));
    const missing = ATS_KEYWORDS.filter((keyword) => !normalized.includes(keyword));
    return { present, missing };
  }, [resumeText]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<ProfilePayload>("/profile");
      setProfile(response.data);
      setBasicForm(defaultBasicForm(response.data.user));
      setFormError(null);
    } catch (error) {
      setFormError(
        typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Failed to load profile"
          : "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const saveBasic = async () => {
    if (!basicForm.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }

    setFormError(null);
    setIsSavingBasic(true);

    try {
      await apiClient.put("/profile", {
        fullName: basicForm.fullName,
        phone: basicForm.phone || null,
        location: basicForm.location || null,
        workAuthorization: basicForm.workAuthorization || null,
        expectedSalary: basicForm.expectedSalary ? Number(basicForm.expectedSalary) : null,
        linkedinUrl: basicForm.linkedinUrl || null,
        githubUrl: basicForm.githubUrl || null,
        portfolioUrl: basicForm.portfolioUrl || null,
        websiteUrl: basicForm.websiteUrl || null,
        totalYearsExperience: basicForm.totalYearsExperience ? Number(basicForm.totalYearsExperience) : null,
        personalBio: basicForm.personalBio || null,
        resumeSummary: basicForm.resumeSummary || null
      });

      pushToast("Profile updated", "success");
      await loadProfile();
    } catch (error) {
      setFormError(
        typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === "string"
          ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Failed to save profile"
          : "Failed to save profile"
      );
    } finally {
      setIsSavingBasic(false);
    }
  };

  const addWork = async () => {
    if (!workForm.company || !workForm.title || !workForm.startDate) {
      pushToast("Company, title, and start date are required.", "error");
      return;
    }

    await apiClient.post("/profile/work-history", {
      company: workForm.company,
      title: workForm.title,
      location: workForm.location || null,
      startDate: new Date(workForm.startDate).toISOString(),
      endDate: workForm.endDate ? new Date(workForm.endDate).toISOString() : null,
      description: workForm.description || null,
      technologies: workForm.technologies
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    });

    pushToast("Work history added", "success");
    setWorkForm({
      company: "",
      title: "",
      location: "",
      startDate: "",
      endDate: "",
      description: "",
      technologies: ""
    });
    await loadProfile();
  };

  const removeWork = async (id: string) => {
    await apiClient.delete(`/profile/work-history/${id}`);
    pushToast("Work history removed", "success");
    await loadProfile();
  };

  const addEducation = async () => {
    if (!educationForm.school || !educationForm.degree) {
      pushToast("School and degree are required.", "error");
      return;
    }

    await apiClient.post("/profile/education", {
      school: educationForm.school,
      degree: educationForm.degree,
      fieldOfStudy: educationForm.fieldOfStudy || null,
      graduationYear: educationForm.graduationYear ? Number(educationForm.graduationYear) : null,
      gpa: educationForm.gpa || null
    });

    pushToast("Education added", "success");
    setEducationForm({ school: "", degree: "", fieldOfStudy: "", graduationYear: "", gpa: "" });
    await loadProfile();
  };

  const removeEducation = async (id: string) => {
    await apiClient.delete(`/profile/education/${id}`);
    pushToast("Education removed", "success");
    await loadProfile();
  };

  const addSkill = async () => {
    if (!skillInput.trim()) {
      pushToast("Skill name is required.", "error");
      return;
    }

    await apiClient.post("/profile/skills", { name: skillInput.trim(), level: skillLevel });
    pushToast("Skill added", "success");
    setSkillInput("");
    await loadProfile();
  };

  const removeSkill = async (id: string) => {
    await apiClient.delete(`/profile/skills/${id}`);
    pushToast("Skill removed", "success");
    await loadProfile();
  };

  const handleResumeUploaded = (result: ResumeUploadResult) => {
    pushToast(`Uploaded ${result.fileName}`, "success");
    void loadProfile();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!profile) {
    return <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{formError ?? "Unable to load profile."}</p>;
  }

  return (
    <div className="space-y-5">
      <TabsList tabs={TAB_ITEMS} active={activeTab} onChange={setActiveTab} />

      {activeTab === "basic" ? (
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Keep profile details updated for AI autofill quality.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={basicForm.fullName}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, fullName: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={basicForm.phone} onChange={(event) => setBasicForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={basicForm.location} onChange={(event) => setBasicForm((prev) => ({ ...prev, location: event.target.value }))} />
              </div>
              <div>
                <Label htmlFor="workAuth">Work Authorization</Label>
                <Input
                  id="workAuth"
                  value={basicForm.workAuthorization}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, workAuthorization: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="salary">Expected Salary</Label>
                <Input
                  id="salary"
                  type="number"
                  value={basicForm.expectedSalary}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, expectedSalary: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="experience">Total Years Experience</Label>
                <Input
                  id="experience"
                  type="number"
                  value={basicForm.totalYearsExperience}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, totalYearsExperience: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="linkedin">LinkedIn URL</Label>
                <Input
                  id="linkedin"
                  value={basicForm.linkedinUrl}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, linkedinUrl: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="github">GitHub URL</Label>
                <Input
                  id="github"
                  value={basicForm.githubUrl}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, githubUrl: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="portfolio">Portfolio URL</Label>
                <Input
                  id="portfolio"
                  value={basicForm.portfolioUrl}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, portfolioUrl: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="website">Website URL</Label>
                <Input
                  id="website"
                  value={basicForm.websiteUrl}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bio">Personal Bio</Label>
              <Textarea
                id="bio"
                value={basicForm.personalBio}
                onChange={(event) => setBasicForm((prev) => ({ ...prev, personalBio: event.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="summary">Resume Summary</Label>
              <Textarea
                id="summary"
                value={basicForm.resumeSummary}
                onChange={(event) => setBasicForm((prev) => ({ ...prev, resumeSummary: event.target.value }))}
              />
            </div>

            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
            <Button onClick={saveBasic} disabled={isSavingBasic}>
              {isSavingBasic ? "Saving..." : "Save Profile"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "work" ? (
        <Card>
          <CardHeader>
            <CardTitle>Work History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="Company" value={workForm.company} onChange={(event) => setWorkForm((prev) => ({ ...prev, company: event.target.value }))} />
              <Input placeholder="Title" value={workForm.title} onChange={(event) => setWorkForm((prev) => ({ ...prev, title: event.target.value }))} />
              <Input placeholder="Location" value={workForm.location} onChange={(event) => setWorkForm((prev) => ({ ...prev, location: event.target.value }))} />
              <Input type="date" value={workForm.startDate} onChange={(event) => setWorkForm((prev) => ({ ...prev, startDate: event.target.value }))} />
              <Input type="date" value={workForm.endDate} onChange={(event) => setWorkForm((prev) => ({ ...prev, endDate: event.target.value }))} />
              <Input
                placeholder="Technologies (comma separated)"
                value={workForm.technologies}
                onChange={(event) => setWorkForm((prev) => ({ ...prev, technologies: event.target.value }))}
              />
            </div>
            <Textarea placeholder="Description" value={workForm.description} onChange={(event) => setWorkForm((prev) => ({ ...prev, description: event.target.value }))} />
            <Button onClick={addWork}>
              <Plus className="mr-2 h-4 w-4" />
              Add Work Entry
            </Button>

            <div className="space-y-2">
              {profile.workHistory.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.company}</p>
                    <p className="text-xs text-slate-500">
                      {asDateInput(item.startDate)} - {item.endDate ? asDateInput(item.endDate) : "Current"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void removeWork(item.id)}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "education" ? (
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="School" value={educationForm.school} onChange={(event) => setEducationForm((prev) => ({ ...prev, school: event.target.value }))} />
              <Input placeholder="Degree" value={educationForm.degree} onChange={(event) => setEducationForm((prev) => ({ ...prev, degree: event.target.value }))} />
              <Input
                placeholder="Field of Study"
                value={educationForm.fieldOfStudy}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, fieldOfStudy: event.target.value }))}
              />
              <Input
                placeholder="Graduation Year"
                type="number"
                value={educationForm.graduationYear}
                onChange={(event) => setEducationForm((prev) => ({ ...prev, graduationYear: event.target.value }))}
              />
              <Input placeholder="GPA" value={educationForm.gpa} onChange={(event) => setEducationForm((prev) => ({ ...prev, gpa: event.target.value }))} />
            </div>
            <Button onClick={addEducation}>
              <Plus className="mr-2 h-4 w-4" />
              Add Education
            </Button>

            <div className="space-y-2">
              {profile.education.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div>
                    <p className="font-medium">{item.school}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.degree}</p>
                    <p className="text-xs text-slate-500">{item.graduationYear ?? "Year not provided"}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void removeEducation(item.id)}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "skills" ? (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input value={skillInput} onChange={(event) => setSkillInput(event.target.value)} placeholder="Add a skill" />
              <Select value={skillLevel} onChange={(event) => setSkillLevel(event.target.value as typeof skillLevel)} className="sm:w-48">
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="EXPERT">Expert</option>
              </Select>
              <Button onClick={addSkill}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <Badge key={skill.id} variant="secondary" className="gap-2">
                  {skill.name} ({skill.level.toLowerCase()})
                  <button type="button" onClick={() => void removeSkill(skill.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "resume" ? (
        <div className="space-y-4">
          <ResumeUploader
            fileName={profile.user.resumeFileName}
            filePath={profile.user.resumeFilePath}
            onUploaded={handleResumeUploaded}
          />

          <Card>
            <CardHeader>
              <CardTitle>Parsed Resume Text</CardTitle>
              <CardDescription>First 1200 characters from your latest uploaded resume.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{resumeText.slice(0, 1200) || "Upload resume to preview parsed text."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ATS Keyword Analysis</CardTitle>
              <CardDescription>Quick keyword presence snapshot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-medium text-rose-600">Missing Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {keywordAnalysis.missing.map((item) => (
                    <Badge key={item} variant="destructive">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-emerald-600">Present Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {keywordAnalysis.present.map((item) => (
                    <Badge key={item} variant="success">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
