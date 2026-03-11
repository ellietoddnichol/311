
import React, { useEffect, useState } from 'react';
import { Save, Building2, Mail, MapPin, Percent, DollarSign, Clock, Users, Layers, FileText } from 'lucide-react';
import { api } from '../services/api';
import { UserProfile } from '../types';

export function Settings() {
  const [settings, setSettings] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateSettings(settings);
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="p-12 text-center text-gray-500">Loading settings...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Configure your company profile and default estimation rules.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-8 py-3 rounded-xl font-semibold flex items-center space-x-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
        >
          <Save className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <div className="space-y-8">
        {/* Company Profile */}
        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <Building2 className="w-5 h-5 text-blue-600 mr-3" />
            Company Profile
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Company Name</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
              <input
                type="email"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Phone Number</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.id} // Reusing id as placeholder for phone
                onChange={(e) => setSettings({ ...settings, id: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Address Line 1</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.companyAddress1}
                onChange={(e) => setSettings({ ...settings, companyAddress1: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Address Line 2</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.companyAddress2}
                onChange={(e) => setSettings({ ...settings, companyAddress2: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Default Rules */}
        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <Percent className="w-5 h-5 text-blue-600 mr-3" />
            Default Estimation Rules
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Labor Rate ($/hr)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                  value={settings.preferences.defaultLaborRate}
                  onChange={(e) => setSettings({ ...settings, preferences: { ...settings.preferences, defaultLaborRate: parseFloat(e.target.value) || 0 } })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Overhead (%)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.preferences.defaultOverheadPct * 100}
                onChange={(e) => setSettings({ ...settings, preferences: { ...settings.preferences, defaultOverheadPct: parseFloat(e.target.value) / 100 || 0 } })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Profit (%)</label>
              <input
                type="number"
                className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                value={settings.preferences.defaultProfitPct * 100}
                onChange={(e) => setSettings({ ...settings, preferences: { ...settings.preferences, defaultProfitPct: parseFloat(e.target.value) / 100 || 0 } })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Work Day Hours</label>
              <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                  value={settings.preferences.defaultWorkDayHours}
                  onChange={(e) => setSettings({ ...settings, preferences: { ...settings.preferences, defaultWorkDayHours: parseFloat(e.target.value) || 0 } })}
                />
              </div>
            </div>
          </div>
        </section>
        
        {/* Integrations */}
        <section className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <Layers className="w-5 h-5 text-blue-600 mr-3" />
            Integrations
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-3 rounded-xl">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Google Sheets Sync</h3>
                  <p className="text-sm text-gray-500">Sync your catalog and pricing rules from a master spreadsheet.</p>
                </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    const res = await api.syncSheets();
                    alert(`Sync successful: ${res.message}`);
                  } catch (err: any) {
                    alert(`Sync failed: ${err.message}`);
                  }
                }}
                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                Sync Now
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
