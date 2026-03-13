import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, AlertCircle, X, Trash2, CheckCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { gemini } from '../../services/gemini';
import type { IntakeResult, IntakeParsedLine } from '../../shared/types/intake';
import { Project, ProjectLine, CatalogItem } from '../../types';

interface Props {
  project: Project;
  catalog: CatalogItem[];
  onImport: (lines: ProjectLine[], newRooms: string[]) => void;
  onClose: () => void;
}

function MatchBadge({ status, confidence }: { status: IntakeParsedLine['matchStatus']; confidence: number }) {
  if (status === 'matched') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3" />
        Matched {confidence > 0 ? `${Math.round(confidence * 100)}%` : ''}
      </span>
    );
  }
  if (status === 'needs_match') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
        <HelpCircle className="w-3 h-3" />
        Needs Match
      </span>
    );
  }
  return null;
}

export function TakeoffAIParser({ project, catalog, onImport, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [editableLines, setEditableLines] = useState<IntakeParsedLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setIntakeResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
    },
    multiple: false,
  } as any);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const catalogItems = catalog.map((c) => ({
        id: c.id,
        sku: c.sku,
        description: c.description,
        category: c.category,
        uom: c.uom,
        baseMaterialCost: c.baseMaterialCost,
        baseLaborMinutes: c.baseLaborMinutes,
        tags: c.tags,
      }));

      const result = await gemini.parseDocument({
        fileBase64: base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        catalogItems,
      });

      setIntakeResult(result);
      setEditableLines([...result.parsedLines]);
    } catch (err) {
      console.error('AI Parsing failed', err);
      setError(err instanceof Error ? err.message : 'Failed to parse document. Please try again with a clearer file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = () => {
    if (!intakeResult) return;
    const newLines: ProjectLine[] = [];
    const newRooms: string[] = [];

    editableLines.forEach((item) => {
      const roomId = item.roomArea
        ? (project.rooms.find((r) => r.name.toLowerCase() === item.roomArea.toLowerCase())?.id || item.roomArea)
        : project.rooms[0]?.id;

      if (item.roomArea && !project.rooms.find((r) => r.name.toLowerCase() === item.roomArea.toLowerCase())) {
        if (!newRooms.includes(item.roomArea)) newRooms.push(item.roomArea);
      }

      intakeResult.rooms.forEach((room) => {
        if (!project.rooms.find((r) => r.name.toLowerCase() === room.name.toLowerCase())) {
          if (!newRooms.includes(room.name)) newRooms.push(room.name);
        }
      });

      newLines.push({
        lineId: crypto.randomUUID(),
        catalogItemId: item.matchedCatalogItemId || undefined,
        manualDescription: item.matchedCatalogItemId ? undefined : (item.description || item.itemName),
        scopeId: project.scopes[0]?.id || 'div10',
        roomId,
        qty: item.quantity,
        notes: item.notes,
        baseType: 'Metal',
      });
    });

    onImport(newLines, newRooms);
  };

  const updateLine = (index: number, updates: Partial<IntakeParsedLine>) => {
    setEditableLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...updates } : line)));
  };

  const removeLine = (index: number) => {
    setEditableLines((prev) => prev.filter((_, i) => i !== index));
  };

  const matchedCount = editableLines.filter((l) => l.matchStatus === 'matched').length;
  const needsMatchCount = editableLines.filter((l) => l.matchStatus === 'needs_match').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Upload className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Document Parser</h2>
              <p className="text-sm text-gray-500">PDF, images, spreadsheets, CSV, and text documents</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!intakeResult ? (
            /* Upload + Parse UI */
            <div className="space-y-6">
              <div
                {...getRootProps()}
                className={`border-4 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer ${
                  isDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                }`}
              >
                <input {...getInputProps()} />
                <div className="bg-purple-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-purple-600" />
                </div>
                {file ? (
                  <div>
                    <p className="text-lg font-bold text-gray-900">{file.name}</p>
                    <p className="text-gray-500 mt-1 text-sm">Click or drag to replace</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-bold text-gray-900">Drop a document here</p>
                    <p className="text-gray-500 mt-1 text-sm">PDF, images, XLSX, XLS, CSV, or text files</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center space-x-3 text-red-700">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="font-medium text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={!file || parsing}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-purple-100 transition-all flex items-center justify-center space-x-3"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Analyzing Document...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6" />
                    <span>Extract &amp; Match</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Results UI */
            <div className="space-y-5">
              {/* Stats bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {editableLines.length} lines extracted
                  </span>
                  {matchedCount > 0 && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full font-semibold">
                      {matchedCount} matched
                    </span>
                  )}
                  {needsMatchCount > 0 && (
                    <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-semibold">
                      {needsMatchCount} needs match
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
                    Strategy: {intakeResult.diagnostics.parseStrategy}
                  </span>
                </div>
                <button
                  onClick={() => { setIntakeResult(null); setEditableLines([]); setFile(null); }}
                  className="text-sm font-semibold text-purple-600 hover:underline"
                >
                  Start Over
                </button>
              </div>

              {/* Project Metadata */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700"
                >
                  <span>Project Metadata</span>
                  {showMetadata ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showMetadata && (
                  <div className="grid grid-cols-2 gap-3 p-4">
                    {[
                      { label: 'Project Name', key: 'projectName' as const },
                      { label: 'Client', key: 'client' as const },
                      { label: 'Address', key: 'address' as const },
                      { label: 'Bid Date', key: 'bidDate' as const },
                      { label: 'Project #', key: 'projectNumber' as const },
                      { label: 'General Contractor', key: 'generalContractor' as const },
                    ].map(({ label, key }) => (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
                        <input
                          type="text"
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                          value={intakeResult.project[key] || ''}
                          onChange={(e) => setIntakeResult((prev) => prev ? {
                            ...prev,
                            project: { ...prev.project, [key]: e.target.value }
                          } : prev)}
                          placeholder={`Enter ${label.toLowerCase()}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Warnings */}
              {intakeResult.diagnostics.warnings.length > 0 && (
                <div className="border border-amber-200 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowWarnings(!showWarnings)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 text-sm font-semibold text-amber-800"
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {intakeResult.diagnostics.warnings.length} Warning(s)
                    </span>
                    {showWarnings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showWarnings && (
                    <ul className="px-4 py-3 space-y-1">
                      {intakeResult.diagnostics.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                          <span className="mt-0.5 flex-shrink-0">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Lines Table */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Description</th>
                        <th className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide w-20">Qty</th>
                        <th className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide w-20">Unit</th>
                        <th className="px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide">Room/Area</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {editableLines.map((line, i) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <MatchBadge status={line.matchStatus} confidence={line.confidence} />
                            {line.matchExplanation && line.matchStatus !== 'matched' && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]" title={line.matchExplanation}>
                                {line.matchExplanation.slice(0, 40)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm"
                              value={line.description || line.itemName}
                              onChange={(e) => updateLine(i, { description: e.target.value })}
                            />
                            {line.matchedDescription && line.matchStatus === 'matched' && (
                              <div className="text-xs text-green-600 mt-0.5 truncate">→ {line.matchedDescription}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm text-center"
                              value={line.quantity}
                              min={0}
                              onChange={(e) => updateLine(i, { quantity: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm"
                              value={line.unit}
                              onChange={(e) => updateLine(i, { unit: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-sm"
                              value={line.roomArea}
                              placeholder="General"
                              onChange={(e) => updateLine(i, { roomArea: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeLine(i)}
                              className="p-1 text-gray-300 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer note */}
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Review before importing:</strong> Matched items (green) will link to your catalog.
                  Items marked 'Needs Match' (yellow) will be imported as manual entries.
                  Edit any field before importing.
                </p>
              </div>

              <button
                onClick={handleImport}
                disabled={editableLines.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 transition-all"
              >
                Import {editableLines.length} Line{editableLines.length !== 1 ? 's' : ''} into Project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
