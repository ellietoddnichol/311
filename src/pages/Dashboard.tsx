
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, MoreVertical, Clock, CheckCircle, FileText, Archive } from 'lucide-react';
import { api } from '../services/api';
import { Project } from '../types';
import { format } from 'date-fns';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-600';
      case 'Submitted': return 'bg-blue-100 text-blue-600';
      case 'Awarded': return 'bg-green-100 text-green-600';
      case 'Lost': return 'bg-red-100 text-red-600';
      case 'Archived': return 'bg-stone-100 text-stone-500';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleCreateProject = () => {
    navigate('/project/new');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">Manage your active bids and estimates.</p>
        </div>
        <button 
          onClick={handleCreateProject}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center space-x-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Active Bids', value: projects.filter(p => p.status === 'Draft' || p.status === 'Submitted').length, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Awarded', value: projects.filter(p => p.status === 'Awarded').length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Quoted', value: '$0', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Archived', value: projects.filter(p => p.status === 'Archived').length, icon: Archive, color: 'text-stone-600', bg: 'bg-stone-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
            <div className={`${stat.bg} p-3 rounded-xl`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects by name or client..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 flex items-center space-x-2 transition-all">
            <Filter className="w-5 h-5" />
            <span className="font-medium">Filter</span>
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No projects found</h3>
            <p className="text-gray-500 mt-1">Start by creating your first estimate.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Name</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProjects.map((project) => (
                <tr 
                  key={project.id} 
                  className="hover:bg-gray-50/50 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center space-x-2">
                      {project.projectNumber && (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          #{project.projectNumber}
                        </span>
                      )}
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{project.name}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{project.address || 'No address provided'}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-medium text-gray-700">{project.clientName}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(project.status)}`}>
                      {project.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm text-gray-500">
                      {project.createdDate && !isNaN(new Date(project.createdDate).getTime()) 
                        ? format(new Date(project.createdDate), 'MMM d, yyyy') 
                        : 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-gray-600 transition-all">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
