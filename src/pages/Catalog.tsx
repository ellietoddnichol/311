
import React, { useEffect, useState } from 'react';
import { Plus, Search, Filter, Edit2, Trash2, MoreVertical, Package, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { CatalogItem } from '../types';

export function Catalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    try {
      const data = await api.getCatalog();
      setItems(data);
    } catch (err) {
      console.error('Failed to load catalog', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter(i => 
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    i.sku.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateItem = () => {
    const newItem: CatalogItem = {
      id: crypto.randomUUID(),
      sku: 'SKU-' + Math.floor(Math.random() * 10000),
      category: 'Toilet Accessories',
      description: 'New Catalog Item',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: true,
      adaFlag: false,
      active: true,
      tags: []
    };
    setEditingItem(newItem);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const isNew = !items.find(i => i.id === editingItem.id);
      if (isNew) {
        await api.createCatalogItem(editingItem);
      } else {
        await api.updateCatalogItem(editingItem);
      }
      setEditingItem(null);
      loadCatalog();
    } catch (err) {
      console.error('Failed to save item', err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await api.deleteCatalogItem(id);
      loadCatalog();
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Product Catalog</h1>
          <p className="text-gray-500 mt-1">Manage your standard items, pricing, and labor rules.</p>
        </div>
        <button 
          onClick={handleCreateItem}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center space-x-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by description, SKU, or category..."
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 flex items-center space-x-2 transition-all">
            <Filter className="w-5 h-5" />
            <span className="font-medium">Category</span>
          </button>
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-12 text-center text-gray-500">Loading catalog...</div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full p-12 text-center">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No items found</h3>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md transition-all group relative">
              <div className="flex justify-between items-start mb-4">
                <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded uppercase tracking-tighter">
                  {item.category}
                </span>
                <div className="flex items-center space-x-2">
                  {item.adaFlag && <ShieldCheck className="w-4 h-4 text-green-500" title="ADA Compliant" />}
                  <div className="relative group/menu">
                    <button className="p-1 text-gray-300 hover:text-gray-600">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 hidden group-hover/menu:block bg-white shadow-xl border border-gray-100 rounded-xl p-1 z-20 min-w-[120px]">
                      <button 
                        onClick={() => setEditingItem(item)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg flex items-center space-x-2"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit Item</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg flex items-center space-x-2"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <h3 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{item.description}</h3>
              <p className="text-xs text-gray-400 font-bold tracking-widest uppercase mb-4">{item.sku}</p>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Material Cost</p>
                  <p className="text-lg font-black text-gray-900">${item.baseMaterialCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Labor Time</p>
                  <p className="text-lg font-black text-gray-900">{item.baseLaborMinutes} <span className="text-xs font-normal text-gray-400">mins</span></p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gray-900/60 backdrop-blur-sm">
          <form onSubmit={handleSaveItem} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Edit Catalog Item</h2>
              <button 
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">SKU</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                    value={editingItem.sku}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Category</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Base Material Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                    value={editingItem.baseMaterialCost}
                    onChange={(e) => setEditingItem({ ...editingItem, baseMaterialCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Base Labor Minutes</label>
                  <input
                    type="number"
                    className="w-full px-4 py-3 bg-gray-50 border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                    value={editingItem.baseLaborMinutes}
                    onChange={(e) => setEditingItem({ ...editingItem, baseLaborMinutes: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button 
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-6 py-3 text-gray-500 font-semibold hover:text-gray-700 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-blue-100 transition-all active:scale-95"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
