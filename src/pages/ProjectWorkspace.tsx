
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Table, Settings, Send, Printer, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Project, EstimateResult } from '../types';
import { ProjectSetup } from '../components/project/ProjectSetup';
import { TakeoffTable } from '../components/project/TakeoffTable';
import { ProposalView } from '../components/project/ProposalView';
import { BundleManager } from '../components/project/BundleManager';
import { Layers } from 'lucide-react';

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'takeoff' | 'bundles' | 'proposal'>('takeoff');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) loadProject(id);
  }, [id]);

  useEffect(() => {
    if (project) {
      calculateLocalEstimate();
    }
  }, [project?.lines, project?.settings, project?.rooms, project?.scopes, project?.alternates]);

  async function calculateLocalEstimate() {
    if (!project) return;
    try {
      const est = await api.calculateEstimate(project);
      setEstimate(est);
    } catch (err) {
      console.error('Failed to calculate estimate', err);
    }
  }

  async function loadProject(projectId: string) {
    try {
      const data = await api.getProject(projectId);
      setProject(data);
    } catch (err) {
      console.error('Failed to load project', err);
      navigate('/');
    }
  }

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      await api.updateProject(project);
      const est = await api.calculateEstimate(project);
      setEstimate(est);
    } catch (err) {
      console.error('Failed to save project', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!project || !confirm('Are you sure you want to delete this project?')) return;
    try {
      await api.deleteProject(project.id);
      navigate('/');
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  }

  if (!project) return <div className="p-12 text-center text-gray-500">Loading project...</div>;

  const tabs = [
    { id: 'setup', label: 'Project Setup', icon: Settings },
    { id: 'takeoff', label: 'Takeoff & Pricing', icon: Table },
    { id: 'bundles', label: 'Bundles', icon: Layers },
    { id: 'proposal', label: 'Proposal', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-6">
          <button 
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{project.name}</h1>
            <div className="flex items-center space-x-3 mt-0.5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{project.clientName}</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-tighter">
                {project.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right mr-6 border-r border-gray-100 pr-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Base Bid Total</p>
            <p className="text-xl font-black text-gray-900">
              ${estimate?.baseBidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          
          <button 
            onClick={handleDelete}
            className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            title="Delete Project"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-xl font-semibold flex items-center space-x-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            <Save className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Project'}</span>
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-8 flex items-center space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 py-4 border-b-2 transition-all font-semibold text-sm ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'setup' && (
            <ProjectSetup 
              project={project} 
              onUpdate={(updated) => setProject(updated)} 
            />
          )}
          {activeTab === 'takeoff' && (
            <TakeoffTable 
              project={project} 
              estimate={estimate}
              onUpdate={(updated) => setProject(updated)} 
            />
          )}
          {activeTab === 'bundles' && (
            <BundleManager 
              project={project} 
              onUpdate={(updated) => setProject(updated)} 
            />
          )}
          {activeTab === 'proposal' && (
            <ProposalView 
              project={project} 
              estimate={estimate}
            />
          )}
        </div>
      </div>
    </div>
  );
}
