
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Building2, User, MapPin, Calendar, Briefcase } from 'lucide-react';
import { api } from '../services/api';
import { Project, UserProfile } from '../types';
import { getDistanceInMiles } from '../utils/geo';

export function ProjectIntake() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState<UserProfile | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [formData, setFormData] = useState({
    projectNumber: '',
    name: '',
    clientName: '',
    address: '',
    projectType: 'Commercial',
    bidDate: '',
    dueDate: ''
  });

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || creating) return;

    setCreating(true);
    try {
      let travelSurcharge = 0;
      let isRemote = false;

      if (distance && distance > 50) {
        travelSurcharge = 500; // Flat fee for remote projects
        isRemote = true;
      }

      const newProject: Project = {
        id: crypto.randomUUID(),
        projectNumber: formData.projectNumber || undefined,
        name: formData.name || 'New Project',
        clientName: formData.clientName || 'New Client',
        address: formData.address,
        bidDate: formData.bidDate,
        dueDate: formData.dueDate,
        projectType: formData.projectType,
        status: 'Draft',
        createdDate: new Date().toISOString(),
        settings: {
          laborRate: settings.preferences.defaultLaborRate,
          taxRate: 0,
          overheadPct: settings.preferences.defaultOverheadPct,
          profitPct: settings.preferences.defaultProfitPct,
          laborBurdenPct: settings.preferences.defaultLaborBurdenPct || 0,
          workDayHours: settings.preferences.defaultWorkDayHours,
          crewSize: settings.preferences.defaultCrewSize,
          selectedConditions: { 
            union: false, 
            prevailing: false, 
            remote: isRemote, 
            night: false, 
            occupied: false, 
            remodel: false, 
            phased: false 
          },
          conditionMultipliers: { union: 1.2, prevailing: 1.3, remote: 1.15, night: 1.25, occupied: 1.1, remodel: 1.15, phased: 1.2 },
          projectSize: 'Medium',
          floorLevel: 'Ground',
          distanceFromDrop: '0-50',
          accessDifficulty: 'Easy',
          installationHeight: 'Under 8',
          materialHandling: 'Manual',
          wallSubstrate: 'Drywall',
          layoutComplexity: 'Standard',
          travelSurcharge: travelSurcharge
        },
        proposalSettings: {
          title: 'PROPOSAL',
          projectName: formData.name || 'New Project',
          projectAddress: formData.address,
          clientName: formData.clientName || 'New Client',
          companyName: settings.companyName,
          companyAddress1: settings.companyAddress1,
          companyAddress2: settings.companyAddress2,
          footerText: 'Thank you for the opportunity to bid on this project.',
          showLineItems: true,
          breakdownMode: 'scope'
        },
        scopes: [{ id: 'div10', name: 'Division 10 Specialties', pricingMode: 'material_and_labor' }],
        rooms: [{ id: 'room1', name: 'General' }],
        bundles: [],
        alternates: [],
        lines: []
      };

      await api.createProject(newProject);
      navigate(`/project/${newProject.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert("Failed to create project. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleAddressBlur = async () => {
    if (!formData.address) return;
    setCalculatingDistance(true);
    const dist = await getDistanceInMiles(formData.address);
    setDistance(dist);
    setCalculatingDistance(false);
  };

  if (loading) return <div className="p-12 text-center text-gray-500">Loading settings...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center space-x-4 mb-8">
        <button 
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-all"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Project Intake</h1>
          <p className="text-gray-500">Enter the initial details for your new estimate.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <Briefcase className="w-3 h-3" />
                <span>Project #</span>
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g. 2024-001"
                value={formData.projectNumber}
                onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <Briefcase className="w-3 h-3" />
                <span>Project Name</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g. Austin Medical Center"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <User className="w-3 h-3" />
                <span>Client Name</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g. Brighten Builders"
                value={formData.clientName}
                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="w-3 h-3" />
                <span>Project Address</span>
              </div>
              {calculatingDistance && <span className="text-blue-500 animate-pulse">Calculating distance...</span>}
              {distance !== null && !calculatingDistance && (
                <span className={`text-xs ${distance > 50 ? 'text-orange-600 font-bold' : 'text-green-600'}`}>
                  {distance.toFixed(1)} miles from office {distance > 50 ? '(Remote Surcharge Applies)' : ''}
                </span>
              )}
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="123 Main St, Austin, TX 78701"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              onBlur={handleAddressBlur}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <Building2 className="w-3 h-3" />
                <span>Project Type</span>
              </label>
              <select
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={formData.projectType}
                onChange={e => setFormData({ ...formData, projectType: e.target.value })}
              >
                <option>Commercial</option>
                <option>Residential</option>
                <option>Industrial</option>
                <option>Institutional</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <Calendar className="w-3 h-3" />
                <span>Bid Date</span>
              </label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={formData.bidDate}
                onChange={e => setFormData({ ...formData, bidDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
                <Calendar className="w-3 h-3" />
                <span>Due Date</span>
              </label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={formData.dueDate}
                onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            type="submit"
            disabled={creating || calculatingDistance}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-8 py-4 rounded-2xl font-bold flex items-center space-x-3 shadow-xl shadow-blue-200 transition-all active:scale-95"
          >
            {creating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Creating Project...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Create Project & Start Takeoff</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
