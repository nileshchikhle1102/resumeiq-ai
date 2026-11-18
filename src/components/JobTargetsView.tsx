import React, { useState } from 'react';
import { Briefcase, Check, Plus, ScanSearch, Trash2 } from 'lucide-react';
import { createId } from '../data/defaultData';
import { JobTarget } from '../types/resume';

interface JobTargetsViewProps {
  jobs: JobTarget[];
  activeJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onSaveJob: (job: JobTarget) => void;
  onDeleteJob: (jobId: string) => void;
  onRunAtsForJob: (jobId: string) => void;
}

export const JobTargetsView: React.FC<JobTargetsViewProps> = ({
  jobs,
  activeJobId,
  onSelectJob,
  onSaveJob,
  onDeleteJob,
  onRunAtsForJob,
}) => {
  const activeJob = jobs.find((j) => j.id === activeJobId) || null;
  const [editingId, setEditingId] = useState<string | null>(activeJob?.id ?? null);
  const [title, setTitle] = useState(activeJob?.title ?? '');
  const [company, setCompany] = useState(activeJob?.company ?? '');
  const [location, setLocation] = useState(activeJob?.location ?? '');
  const [description, setDescription] = useState(activeJob?.description ?? '');

  const loadIntoForm = (job: JobTarget | null) => {
    if (!job) {
      setEditingId(null);
      setTitle('');
      setCompany('');
      setLocation('');
      setDescription('');
      return;
    }
    setEditingId(job.id);
    setTitle(job.title);
    setCompany(job.company);
    setLocation(job.location);
    setDescription(job.description);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const saved: JobTarget = {
      id: editingId || createId('job'),
      title: title.trim(),
      company: company.trim() || 'Target Company',
      location: location.trim(),
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    };
    onSaveJob(saved);
    onSelectJob(saved.id);
    setEditingId(saved.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Saved Jobs List */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saved Target Jobs
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a role to benchmark keyword alignment and bullet relevance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadIntoForm(null)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Job</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No saved job descriptions yet. Paste a job description on the right to start optimizing.
            </div>
          ) : (
            jobs.map((job) => {
              const isActive = job.id === activeJobId;
              return (
                <div
                  key={job.id}
                  className={`p-4 transition-colors ${
                    isActive
                      ? 'bg-blue-50/50 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectJob(job.id);
                        loadIntoForm(job);
                      }}
                      className="text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {job.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 pl-6">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 pl-6 line-clamp-2">
                        {job.description}
                      </p>
                    </button>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectJob(job.id);
                            loadIntoForm(job);
                          }}
                          className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                        >
                          Select
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteJob(job.id)}
                        title="Delete saved job"
                        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Paste / Edit Job Form */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? 'Edit Target Job Description' : 'Paste New Target Job Description'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Include responsibilities and requirements for accurate AI keyword scoring.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={() => onRunAtsForJob(editingId)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              <span>Analyze Match</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Job Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Senior Product Engineer"
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Company
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., Stripe"
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Location / Work Mode
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., San Francisco, CA / Hybrid"
              className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Full Job Description *
            </label>
            <textarea
              required
              rows={11}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste the full job posting (responsibilities, qualifications, tech stack)..."
              className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="submit"
            className="min-h-[42px] px-5 py-2 text-sm font-medium text-white dark:text-slate-950 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer"
          >
            {editingId ? 'Save Changes' : 'Save Target Job'}
          </button>
        </div>
      </form>
    </div>
  );
};
