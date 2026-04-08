
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Layers, Box } from 'lucide-react';
import { Project, Bundle, CatalogItem } from '../../types';
import { api } from '../../services/api';
import { catalogItemMatchesQuery } from '../../shared/utils/catalogItemSearch';

interface Props {
  project: Project;
  onUpdate: (project: Project) => void;
}

export function BundleManager({ project, onUpdate }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(project.bundles[0]?.id || null);

  useEffect(() => {
    api.getCatalog().then(setCatalog);
  }, []);

  const handleAddBundle = () => {
    const name = prompt('Enter bundle name:');
    if (!name) return;
    const newBundle: Bundle = {
      id: crypto.randomUUID(),
      name,
      items: []
    };
    onUpdate({ ...project, bundles: [...project.bundles, newBundle] });
    setSelectedBundleId(newBundle.id);
  };

  const handleDeleteBundle = (id: string) => {
    if (!confirm('Are you sure you want to delete this bundle?')) return;
    onUpdate({
      ...project,
      bundles: project.bundles.filter(b => b.id !== id)
    });
    if (selectedBundleId === id) setSelectedBundleId(null);
  };

  const handleAddItemToBundle = (bundleId: string, item: CatalogItem) => {
    onUpdate({
      ...project,
      bundles: project.bundles.map(b => {
        if (b.id !== bundleId) return b;
        if (b.items.find(i => i.catalogItemId === item.id)) return b;
        return {
          ...b,
          items: [...b.items, { catalogItemId: item.id, qty: 1 }]
        };
      })
    });
  };

  const handleUpdateBundleItemQty = (bundleId: string, catalogItemId: string, qty: number) => {
    onUpdate({
      ...project,
      bundles: project.bundles.map(b => {
        if (b.id !== bundleId) return b;
        return {
          ...b,
          items: b.items.map(i => i.catalogItemId === catalogItemId ? { ...i, qty } : i)
        };
      })
    });
  };

  const handleRemoveItemFromBundle = (bundleId: string, catalogItemId: string) => {
    onUpdate({
      ...project,
      bundles: project.bundles.map(b => {
        if (b.id !== bundleId) return b;
        return {
          ...b,
          items: b.items.filter(i => i.catalogItemId !== catalogItemId)
        };
      })
    });
  };

  const selectedBundle = project.bundles.find(b => b.id === selectedBundleId);
  const filteredCatalog = catalog.filter((item) => catalogItemMatchesQuery(item, searchQuery));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-280px)]">
      {/* Left Column: Bundle List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="font-bold text-gray-900 flex items-center">
            <Layers className="mr-2 h-5 w-5" style={{ color: 'var(--brand)' }} />
            Project Bundles
          </h2>
          <button 
            onClick={handleAddBundle}
            className="ui-btn-primary rounded-lg p-2 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {project.bundles.length === 0 ? (
            <div className="text-center py-12 text-gray-400 italic text-sm">
              No bundles created yet.
            </div>
          ) : (
            project.bundles.map(bundle => (
              <div 
                key={bundle.id}
                onClick={() => setSelectedBundleId(bundle.id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${
                  selectedBundleId === bundle.id
                    ? 'border-blue-500 bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                    : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div>
                  <div className="font-bold">{bundle.name}</div>
                  <div className="text-xs opacity-70">{bundle.items.length} items</div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteBundle(bundle.id); }}
                  className="p-2 text-gray-400 hover:text-red-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle Column: Bundle Contents */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        {selectedBundle ? (
          <>
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-bold text-gray-900 text-xl">{selectedBundle.name}</h2>
              <p className="text-sm text-gray-500">Add items from the catalog below to include them in this bundle.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Bundle Items</h3>
                {selectedBundle.items.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
                    This bundle is empty.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedBundle.items.map(bundleItem => {
                      const catalogItem = catalog.find(ci => ci.id === bundleItem.catalogItemId);
                      return (
                        <div key={bundleItem.catalogItemId} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-white rounded-lg border border-gray-100 flex items-center justify-center">
                              <Box className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <div className="font-bold text-gray-900">{catalogItem?.description || 'Loading...'}</div>
                              <div className="text-xs text-gray-400">{catalogItem?.sku}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6">
                            <div className="flex items-center space-x-3">
                              <span className="text-xs font-bold text-gray-400 uppercase">Qty:</span>
                              <input
                                type="number"
                                className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-center font-bold"
                                value={bundleItem.qty}
                                onChange={(e) => handleUpdateBundleItemQty(selectedBundle.id, bundleItem.catalogItemId, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                            <button 
                              onClick={() => handleRemoveItemFromBundle(selectedBundle.id, bundleItem.catalogItemId)}
                              className="p-2 text-gray-300 hover:text-red-600 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-12 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Add from Catalog</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search catalog..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border-transparent rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="grid max-h-[min(60vh,520px)] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                  {filteredCatalog.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleAddItemToBundle(selectedBundle.id, item)}
                      className="p-3 text-left border border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all flex justify-between items-center group"
                    >
                      <div className="truncate pr-4">
                        <div className="font-bold text-gray-900 text-sm truncate">{item.description}</div>
                        <div className="text-[10px] text-gray-400">{item.sku}</div>
                      </div>
                      <Plus className="w-4 h-4 text-gray-300 group-hover:text-blue-600 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12">
            <Layers className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a bundle to manage its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
