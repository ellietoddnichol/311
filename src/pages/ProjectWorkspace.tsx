import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Calculator, Clock3, Download, FileUp, Hammer, Layers3, Paperclip, Sparkles, Trash2, Wallet, CalendarClock } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { BundleRecord, EstimateSummary, InstallReviewEmailDraft, LineModifierRecord, ModifierRecord, ProjectFileRecord, ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
import { CatalogItem } from '../types';
import {
  createDefaultProjectJobConditions,
  normalizeProjectJobConditions,
  recommendDeliveryPlan,
  recommendedPhasedWorkMultiplier,
} from '../shared/utils/jobConditions';
import { buildProposalLineItems, buildProposalScheduleSections, splitProposalTextLines } from '../shared/utils/proposalDocument';
import { collectPastProjectDateErrors, mapProjectDateErrors } from '../shared/utils/projectDateValidation';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  ensureProposalDefaults,
} from '../shared/utils/proposalDefaults';
import { TopProjectHeader } from '../components/workspace/TopProjectHeader';
import { RoomManager } from '../components/workspace/RoomManager';
import { EstimateGrid } from '../components/workspace/EstimateGrid';
import { ItemPicker } from '../components/workspace/ItemPicker';
import { ModifierPanel } from '../components/workspace/ModifierPanel';
import { ProposalPreview } from '../components/workspace/ProposalPreview';
import { BundlePickerModal } from '../components/workspace/BundlePickerModal';
import { EstimateSelectedLineEditor } from '../components/workspace/EstimateSelectedLineEditor';
import { EstimateRunningTotalBar } from '../components/workspace/EstimateRunningTotalBar';
import { EstimateSidebar, WorkspaceSidebarTab } from '../components/workspace/EstimateSidebar';
import { WorkspaceToolbar } from '../components/workspace/WorkspaceToolbar';
import { CrewRecommendationCard } from '../components/workflow/CrewRecommendationCard';
import { calculateEstimateSummary } from '../shared/utils/estimateSummary';
import { calculateWorkDuration, formatWorkWeeksLabel } from '../shared/utils/workDuration';
import { formatCurrencySafe, formatKilobytesSafe, formatNumberSafe } from '../utils/numberFormat';
import { getDistanceInMiles } from '../utils/geo';

interface RoomCreationDraft {
  roomName: string;
  addStarterLine: boolean;
  starterDescription: string;
  starterQty: number;
  starterUnit: string;
}

type WorkspaceTab = 'overview' | 'setup' | 'rooms' | 'takeoff' | 'estimate' | 'files' | 'proposal';
type WorkspaceGroupMode = 'room' | 'category';
type WorkspaceScopeMode = 'active' | 'all';
type TakeoffMatchStatus = 'all' | 'matched' | 'unmatched';

const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'rooms', 'takeoff', 'estimate', 'files', 'proposal'];

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return !!value && WORKSPACE_TABS.includes(value as WorkspaceTab);
}

const DEFAULT_ROOM_CREATION_DRAFT: RoomCreationDraft = {
  roomName: '',
  addStarterLine: false,
  starterDescription: 'Manual item',
  starterQty: 1,
  starterUnit: 'EA',
};

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userEmail } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const requestedTab = searchParams.get('tab');
    return isWorkspaceTab(requestedTab) ? requestedTab : 'estimate';
  });

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [lines, setLines] = useState<TakeoffLineRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [summary, setSummary] = useState<EstimateSummary | null>(null);
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [modifiers, setModifiers] = useState<ModifierRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFileRecord[]>([]);
  const [fileUploading, setFileUploading] = useState(false);
  const [lineModifiers, setLineModifiers] = useState<Array<{
    id: string;
    lineId: string;
    modifierId: string;
    name: string;
    addMaterialCost: number;
    addLaborMinutes: number;
    percentMaterial: number;
    percentLabor: number;
    createdAt: string;
  }>>([]);
  const [lineModifiersByLineId, setLineModifiersByLineId] = useState<Record<string, LineModifierRecord[]>>({});

  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [activeRoomId, setActiveRoomId] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [modifiersModalOpen, setModifiersModalOpen] = useState(false);
  const [takeoffRoomsModalOpen, setTakeoffRoomsModalOpen] = useState(false);
  const [roomCreateModalOpen, setRoomCreateModalOpen] = useState(false);
  const [roomCreationDraft, setRoomCreationDraft] = useState<RoomCreationDraft>(DEFAULT_ROOM_CREATION_DRAFT);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [proposalDrafting, setProposalDrafting] = useState<null | 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short'>(null);
  const [installReviewDraft, setInstallReviewDraft] = useState<InstallReviewEmailDraft | null>(null);
  const [installReviewGenerating, setInstallReviewGenerating] = useState(false);
  const [takeoffSidebarTab, setTakeoffSidebarTab] = useState<WorkspaceSidebarTab>('match');
  const [estimateSidebarTab, setEstimateSidebarTab] = useState<WorkspaceSidebarTab>('summary');
  const [estimateSidebarCollapsed, setEstimateSidebarCollapsed] = useState(false);
  const [takeoffSearch, setTakeoffSearch] = useState('');
  const [estimateSearch, setEstimateSearch] = useState('');
  const [takeoffMatchStatus, setTakeoffMatchStatus] = useState<TakeoffMatchStatus>('all');
  const [takeoffUnresolvedOnly, setTakeoffUnresolvedOnly] = useState(false);
  const [takeoffGroupMode, setTakeoffGroupMode] = useState<WorkspaceGroupMode>('room');
  const [estimateGroupMode, setEstimateGroupMode] = useState<WorkspaceGroupMode>('room');
  const [estimateCompactMode, setEstimateCompactMode] = useState(false);
  const [estimateEditorOpen, setEstimateEditorOpen] = useState(false);
  const [setupAdvancedOpen, setSetupAdvancedOpen] = useState(false);
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [projectDateErrors, setProjectDateErrors] = useState<Partial<Record<'bidDate' | 'proposalDate' | 'dueDate', string>>>({});
  const [workspaceScopeMode, setWorkspaceScopeMode] = useState<WorkspaceScopeMode>('active');
  const companyWebsite = 'https://www.brightenbuildersllc.com/';
  const unifiedProjectDate = project?.bidDate || project?.proposalDate || project?.dueDate || '';

  function getProposalFileStem(): string {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const number = project?.projectNumber || project?.id.slice(0, 8) || 'proposal';
    return `proposal-${number}-${dateStamp}`;
  }

  const statusActionLabel = useMemo(() => {
    if (!project) return 'Mark Submitted';
    if (project.status === 'Draft' || project.status === 'Lost') return 'Mark Submitted';
    if (project.status === 'Submitted') return 'Mark Awarded';
    if (project.status === 'Awarded') return 'Archive Project';
    if (project.status === 'Archived') return 'Reopen Draft';
    return 'Mark Submitted';
  }, [project]);

  useEffect(() => {
    if (!id) return;
    void loadWorkspace(id);
  }, [id]);

  useEffect(() => {
    if (!userEmail) return;
    setProject((prev) => {
      if (!prev || String(prev.estimator || '').trim()) return prev;
      return {
        ...prev,
        estimator: userEmail,
      };
    });
  }, [userEmail]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeTab === 'estimate') {
      next.delete('tab');
    } else {
      next.set('tab', activeTab);
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  async function loadWorkspace(projectId: string) {
    try {
      setLoading(true);
      await api.repriceV1ProjectTakeoff(projectId);
      const [projectData, roomData, lineData, catalogData, summaryData, settingsData, modifiersData, bundlesData, filesData] = await Promise.all([
        api.getV1Project(projectId),
        api.getV1Rooms(projectId),
        api.getV1TakeoffLines(projectId),
        api.getCatalog(),
        api.getV1Summary(projectId),
        api.getV1Settings(),
        api.getV1Modifiers(),
        api.getV1Bundles(),
        api.getV1ProjectFiles(projectId),
      ]);

      setProject(projectData);
      setRooms(roomData);
      setLines(lineData);
      setCatalog(catalogData);
      setSummary(summaryData);
      setSettings(ensureProposalDefaults(settingsData));
      setModifiers(modifiersData);
      setBundles(bundlesData);
      setProjectFiles(filesData);

      if (roomData[0]) setActiveRoomId(roomData[0].id);
    } catch (error) {
      console.error('Failed to load project workspace', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  async function refreshTakeoff(projectId: string) {
    const [lineData, summaryData] = await Promise.all([
      api.getV1TakeoffLines(projectId),
      api.getV1Summary(projectId),
    ]);
    setLines(lineData);
    setSummary(summaryData);
  }

  const activeRoomLines = useMemo(
    () => lines.filter((line) => line.roomId === activeRoomId),
    [lines, activeRoomId]
  );

  const selectedLine = useMemo(
    () => lines.find((line) => line.id === selectedLineId) || null,
    [lines, selectedLineId]
  );

  const selectedLineModifierCount = useMemo(() => {
    if (!selectedLineId) return 0;
    return (lineModifiersByLineId[selectedLineId] || lineModifiers).length;
  }, [lineModifiers, lineModifiersByLineId, selectedLineId]);

  useEffect(() => {
    if (!selectedLineId) {
      setEstimateEditorOpen(false);
    }
  }, [selectedLineId]);

  const scopedWorkspaceLines = useMemo(
    () => (workspaceScopeMode === 'all' ? lines : activeRoomLines),
    [activeRoomLines, lines, workspaceScopeMode]
  );

  const takeoffFilteredLines = useMemo(() => {
    return scopedWorkspaceLines.filter((line) => {
      const query = takeoffSearch.trim().toLowerCase();
      const roomLabel = rooms.find((room) => room.id === line.roomId)?.roomName || '';
      const matchesSearch = !query || [
        line.description,
        line.sku || '',
        line.category || '',
        line.notes || '',
        roomLabel,
      ].some((value) => value.toLowerCase().includes(query));
      const matched = !!line.catalogItemId;
      const matchesStatus = takeoffMatchStatus === 'all'
        ? true
        : takeoffMatchStatus === 'matched'
          ? matched
          : !matched;
      const matchesUnresolved = takeoffUnresolvedOnly ? !matched : true;
      return matchesSearch && matchesStatus && matchesUnresolved;
    });
  }, [rooms, scopedWorkspaceLines, takeoffMatchStatus, takeoffSearch, takeoffUnresolvedOnly]);

  const estimateFilteredLines = useMemo(() => {
    return scopedWorkspaceLines.filter((line) => {
      const query = estimateSearch.trim().toLowerCase();
      if (!query) return true;

      const roomLabel = rooms.find((room) => room.id === line.roomId)?.roomName || '';

      return [
        line.description,
        line.sku || '',
        line.category || '',
        roomLabel,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [estimateSearch, rooms, scopedWorkspaceLines]);

  const takeoffSubtotal = useMemo(
    () => takeoffFilteredLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [takeoffFilteredLines]
  );

  const takeoffQuantity = useMemo(
    () => takeoffFilteredLines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
    [takeoffFilteredLines]
  );

  const takeoffUnresolvedCount = useMemo(
    () => takeoffFilteredLines.filter((line) => !line.catalogItemId).length,
    [takeoffFilteredLines]
  );

  const estimateSubtotal = useMemo(
    () => estimateFilteredLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [estimateFilteredLines]
  );

  useEffect(() => {
    if (!selectedLineId) {
      setLineModifiers([]);
      return;
    }

    api.getV1LineModifiers(selectedLineId)
      .then(setLineModifiers)
      .catch(() => setLineModifiers([]));
  }, [selectedLineId]);

  useEffect(() => {
    if (activeTab !== 'estimate' && activeTab !== 'takeoff') {
      setLineModifiersByLineId({});
      return;
    }
    if (lines.length === 0) {
      setLineModifiersByLineId({});
      return;
    }

    let cancelled = false;

    Promise.all(lines.map(async (line) => [line.id, await api.getV1LineModifiers(line.id)] as const))
      .then((entries) => {
        if (cancelled) return;
        setLineModifiersByLineId(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setLineModifiersByLineId({});
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, lines]);

  const roomSubtotal = useMemo(
    () => activeRoomLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [activeRoomLines]
  );

  const roomMetrics = useMemo(() => {
    const byRoom: Record<string, { count: number; subtotal: number }> = {};
    lines.forEach((line) => {
      if (!byRoom[line.roomId]) byRoom[line.roomId] = { count: 0, subtotal: 0 };
      byRoom[line.roomId].count += 1;
      byRoom[line.roomId].subtotal += line.lineTotal;
    });
    return byRoom;
  }, [lines]);

  const pricingMode = project?.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const baseLaborRatePerHour = Number(settings?.defaultLaborRatePerHour || 0);
  const selectedScopeCategories = project?.selectedScopeCategories || [];
  const jobConditions = useMemo(
    () => normalizeProjectJobConditions(project?.jobConditions || createDefaultProjectJobConditions()),
    [project?.jobConditions]
  );

  const roomNamesById = useMemo(() => {
    const out: Record<string, string> = {};
    rooms.forEach((room) => {
      out[room.id] = room.roomName;
    });
    return out;
  }, [rooms]);

  const categories = useMemo(() => {
    const all = new Set<string>();
    catalog.forEach((item) => all.add(item.category));
    return ['all', ...Array.from(all).sort()];
  }, [catalog]);

  const scopeCategoryOptions = useMemo(
    () => categories.filter((category) => category !== 'all'),
    [categories]
  );

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const q = catalogSearch.toLowerCase();
      const searchMatch = item.description.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
      const categoryMatch = catalogCategory === 'all' || item.category === catalogCategory;
      return searchMatch && categoryMatch;
    });
  }, [catalog, catalogSearch, catalogCategory]);

  const proposalGroupedItemCount = useMemo(
    () => buildProposalLineItems(lines).length,
    [lines]
  );

  const estimateViewSummary = useMemo(() => {
    if (!project) return null;
    return calculateEstimateSummary(project, lines);
  }, [project, lines]);
  const currentProposalSummary = estimateViewSummary || summary;

  const takeoffLaborMultiplier = summary?.conditionLaborMultiplier || estimateViewSummary?.conditionLaborMultiplier || 1;
  const estimateLaborMultiplier = estimateViewSummary?.conditionLaborMultiplier || 1;
  const takeoffEffectiveLaborRatePerHour = Number((baseLaborRatePerHour * takeoffLaborMultiplier).toFixed(2));
  const estimateEffectiveLaborRatePerHour = Number((baseLaborRatePerHour * estimateLaborMultiplier).toFixed(2));
  const activeProjectLaborDrivers = useMemo(() => {
    const drivers: string[] = [];
    if (jobConditions.prevailingWage || jobConditions.laborRateBasis === 'prevailing') drivers.push('Prevailing wage');
    if (jobConditions.nightWork) drivers.push('After-hours / night shift');
    if (jobConditions.restrictedAccess) drivers.push('Restricted access');
    if (jobConditions.occupiedBuilding) drivers.push('Occupied building');
    if (jobConditions.remoteTravel) drivers.push('Remote travel');
    if (jobConditions.phasedWork) drivers.push('Phased work');
    if (jobConditions.smallJobFactor) drivers.push('Small job minimum');
    if (jobConditions.scheduleCompression) drivers.push('Schedule compression');
    return drivers;
  }, [jobConditions]);
  const projectLaborDriverDetails = useMemo(() => {
    const baseRate = baseLaborRatePerHour;
    const rows: Array<{ key: string; label: string; dollarsPerHour: number; percent: number }> = [];
    const pushRow = (key: string, label: string, percent: number, enabled: boolean) => {
      if (!enabled || percent === 0) return;
      rows.push({ key, label, percent, dollarsPerHour: Number((baseRate * percent).toFixed(2)) });
    };
    pushRow('prevailing', 'Prevailing wage', jobConditions.prevailingWageMultiplier, jobConditions.prevailingWage || jobConditions.laborRateBasis === 'prevailing');
    pushRow('night', 'After-hours / night shift', jobConditions.nightWorkLaborCostMultiplier, jobConditions.nightWork);
    pushRow('restricted', 'Restricted access', jobConditions.restrictedAccessMultiplier, jobConditions.restrictedAccess);
    pushRow('occupied', 'Occupied building', jobConditions.occupiedBuildingMultiplier, jobConditions.occupiedBuilding);
    pushRow('remote', 'Remote travel', jobConditions.remoteTravelMultiplier, jobConditions.remoteTravel);
    pushRow('small', 'Small job minimum', jobConditions.smallJobMultiplier, jobConditions.smallJobFactor);
    pushRow('phased', 'Phased work', jobConditions.phasedWorkMultiplier, jobConditions.phasedWork);
    pushRow('schedule', 'Schedule compression', jobConditions.scheduleCompressionMultiplier, jobConditions.scheduleCompression);
    pushRow('custom', 'Custom labor multiplier', Math.max(0, jobConditions.laborRateMultiplier - 1), jobConditions.laborRateMultiplier !== 1);
    return rows;
  }, [baseLaborRatePerHour, jobConditions]);
  const projectCostAdderDetails = useMemo(() => {
    const rows: Array<{ key: string; label: string; detail: string }> = [];

    if (jobConditions.deliveryDifficulty === 'constrained') {
      rows.push({ key: 'deliveryDifficulty', label: 'Delivery difficulty', detail: 'Constrained +5% execution impact' });
    }

    if (jobConditions.deliveryDifficulty === 'difficult') {
      rows.push({ key: 'deliveryDifficulty', label: 'Delivery difficulty', detail: 'Difficult +10% execution impact' });
    }

    if (jobConditions.mobilizationComplexity === 'medium') {
      rows.push({ key: 'mobilization', label: 'Mobilization', detail: 'Medium +3% execution impact' });
    }

    if (jobConditions.mobilizationComplexity === 'high') {
      rows.push({ key: 'mobilization', label: 'Mobilization', detail: 'High +7% execution impact' });
    }

    if (jobConditions.deliveryRequired) {
      const deliveryDetail = jobConditions.deliveryPricingMode === 'flat'
        ? `${formatCurrencySafe(jobConditions.deliveryValue)} flat allowance`
        : jobConditions.deliveryPricingMode === 'percent'
          ? `${formatNumberSafe(jobConditions.deliveryValue, 2)}% of base pricing`
          : 'Included with no separate charge';

      rows.push({
        key: 'deliveryAllowance',
        label: 'Delivery allowance',
        detail: `${deliveryDetail}${jobConditions.deliveryLeadDays > 0 ? ` • ${jobConditions.deliveryLeadDays} day${jobConditions.deliveryLeadDays === 1 ? '' : 's'}` : ''}`,
      });
    }

    if (jobConditions.estimateAdderPercent !== 0) {
      rows.push({
        key: 'estimateAdderPercent',
        label: 'Project adder %',
        detail: `${formatNumberSafe(jobConditions.estimateAdderPercent, 2)}% on total estimate`,
      });
    }

    if (jobConditions.estimateAdderAmount !== 0) {
      rows.push({
        key: 'estimateAdderAmount',
        label: 'Project adder $',
        detail: `${formatCurrencySafe(jobConditions.estimateAdderAmount)} direct add`,
      });
    }

    return rows;
  }, [jobConditions]);

  function resolveLocalLinePricing(line: TakeoffLineRecord): TakeoffLineRecord {
    const pricingSource = line.pricingSource === 'manual' ? 'manual' : 'auto';
    const calculatedUnitSell = Number((line.materialCost + line.laborCost).toFixed(2));
    const unitSell = pricingSource === 'manual' ? Number(line.unitSell || 0) : calculatedUnitSell;
    return {
      ...line,
      pricingSource,
      unitSell: Number(unitSell.toFixed(2)),
      lineTotal: Number((unitSell * line.qty).toFixed(2)),
    };
  }

  function patchLineLocal(lineId: string, updates: Partial<TakeoffLineRecord>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const pricingSource = updates.pricingSource ?? (updates.unitSell !== undefined ? 'manual' : line.pricingSource);
        return resolveLocalLinePricing({ ...line, ...updates, pricingSource });
      })
    );
  }

  async function resetLineToCalculatedPrice(lineId: string) {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    const calculatedUnitSell = Number((line.materialCost + line.laborCost).toFixed(2));
    patchLineLocal(lineId, { pricingSource: 'auto', unitSell: calculatedUnitSell });
    await persistLine(lineId, { pricingSource: 'auto', unitSell: calculatedUnitSell });
  }

  function patchJobConditions(updates: Partial<ProjectJobConditions>) {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        jobConditions: normalizeProjectJobConditions({
          ...prev.jobConditions,
          ...updates,
        }),
      };
    });
  }

  function patchProjectDate(value: string) {
    if (!project) return;
    setProject({ ...project, bidDate: value || null, proposalDate: value || null, dueDate: value || null });
  }

  function applyWorkspaceDeliveryRecommendation(distance: number | null, options?: { difficulty?: ProjectJobConditions['deliveryDifficulty']; force?: boolean }) {
    const current = normalizeProjectJobConditions(project?.jobConditions || createDefaultProjectJobConditions());
    if (!options?.force && !current.deliveryAutoCalculated && current.deliveryValue > 0) {
      return;
    }

    patchJobConditions({
      ...recommendDeliveryPlan(distance, options?.difficulty ?? current.deliveryDifficulty),
      deliveryAutoCalculated: true,
    });
  }

  function promptForPhasedWork(enable: boolean) {
    if (!enable) {
      patchJobConditions({ phasedWork: false, phasedWorkPhases: 1, phasedWorkMultiplier: 0 });
      return;
    }

    const response = window.prompt('How many phases should this job be split into?', String(Math.max(2, jobConditions.phasedWorkPhases || 2)));
    if (response === null) return;
    const phaseCount = Math.max(2, Number(response) || 2);
    patchJobConditions({
      phasedWork: true,
      phasedWorkPhases: phaseCount,
      phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount),
    });
  }

  function toggleScopeCategory(category: string) {
    setProject((prev) => {
      if (!prev) return prev;
      const current = prev.selectedScopeCategories || [];
      const next = current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category].sort();
      return {
        ...prev,
        selectedScopeCategories: next,
      };
    });
  }

  async function saveProject() {
    if (!project) return;
    const dateErrors = collectPastProjectDateErrors({ bidDate: project.bidDate, proposalDate: project.proposalDate, dueDate: project.dueDate });
    if (dateErrors.length > 0) {
      setProjectDateErrors(mapProjectDateErrors(dateErrors));
      window.alert(dateErrors[0].message);
      return;
    }
    const normalizedJobConditions = normalizeProjectJobConditions(project.jobConditions);
    if ((project.address || '').trim() && normalizedJobConditions.travelDistanceMiles === null) {
      const distance = await getDistanceInMiles(project.address);
      if (distance !== null) {
        normalizedJobConditions.travelDistanceMiles = distance;
        if (distance > 50) normalizedJobConditions.remoteTravel = true;
        if (normalizedJobConditions.deliveryAutoCalculated) {
          Object.assign(normalizedJobConditions, recommendDeliveryPlan(distance, normalizedJobConditions.deliveryDifficulty));
        }
      }
    }
    const saved = await api.updateV1Project(project.id, { ...project, jobConditions: normalizedJobConditions });
    setProject(saved);
    setLastSavedAt(new Date().toISOString());
    await refreshTakeoff(saved.id);
  }

  async function deleteProjectPermanently() {
    if (!project) return;
    const confirmed = window.confirm(`Delete project "${project.projectName}" permanently? This removes rooms, takeoff lines, and attached files.`);
    if (!confirmed) return;

    try {
      await api.deleteV1Project(project.id);
      navigate('/projects');
    } catch (error) {
      console.error('Failed to delete project', error);
      window.alert('Unable to delete this project right now.');
    }
  }

  async function refreshProjectDistance() {
    if (!project?.address || !project.address.trim()) {
      patchJobConditions({ travelDistanceMiles: null, deliveryRequired: false, deliveryPricingMode: 'included', deliveryValue: 0, deliveryLeadDays: 0 });
      setDistanceError(null);
      return;
    }

    setDistanceCalculating(true);
    setDistanceError(null);
    try {
      const distance = await getDistanceInMiles(project.address);
      if (distance === null) {
        patchJobConditions({ travelDistanceMiles: null });
        setDistanceError('Unable to calculate distance from the current address.');
        return;
      }

      patchJobConditions({
        travelDistanceMiles: distance,
        remoteTravel: distance > 50 ? true : jobConditions.remoteTravel,
      });
      applyWorkspaceDeliveryRecommendation(distance, { force: jobConditions.deliveryAutoCalculated });
    } catch (error) {
      console.error('Distance lookup failed', error);
      setDistanceError('Distance lookup failed.');
    } finally {
      setDistanceCalculating(false);
    }
  }

  async function previewProposal() {
    setActiveTab('proposal');
  }

  function collectProposalStyles(): string {
    const cssChunks: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        if (!rules.length) continue;
        cssChunks.push(rules.map((rule) => rule.cssText).join('\n'));
      } catch (_error) {
        // Ignore cross-origin or restricted stylesheets.
      }
    }

    cssChunks.push(`
      @page { size: Letter; margin: 0.5in; }
      html, body { background: #ffffff !important; margin: 0; padding: 0; }
      body { color: #0f172a; }
      .print-proposal { max-width: 100% !important; margin: 0 auto !important; box-shadow: none !important; width: auto !important; min-height: auto !important; padding: 0 !important; }
      .proposal-document { box-shadow: none !important; width: auto !important; min-height: auto !important; }
      .proposal-section { break-inside: avoid; page-break-inside: avoid; }
      .proposal-page-break { break-before: page; page-break-before: always; }
      .proposal-avoid-break { break-inside: avoid; page-break-inside: avoid; }
      table, tr, td, th { break-inside: avoid; page-break-inside: avoid; }
      thead { display: table-header-group; }
    `);

    return cssChunks.join('\n');
  }

  function buildProposalHtml(container: HTMLElement, title: string): string {
    const styles = collectProposalStyles();
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}</style></head><body>${container.outerHTML}</body></html>`;
  }

  function getProposalContainer(): HTMLElement | null {
    return document.querySelector('[data-proposal-document="true"]') as HTMLElement | null;
  }

  async function printProposalDocument() {
    if (!project) return;
    const container = getProposalContainer();
    if (!container) return;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
    if (!printWindow) {
      window.alert('Unable to open the print window. Check popup settings and try again.');
      return;
    }

    const title = `proposal-${project.projectNumber || project.id.slice(0, 8)}`;
    printWindow.document.open();
    printWindow.document.write(buildProposalHtml(container, title));
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  async function exportProposal() {
    if (!project || !summary) return;

    const proposalSettings = ensureProposalDefaults(settings);
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 46;
    const marginTop = 52;
    const maxTextWidth = pageWidth - (marginX * 2);
    const showMaterialPricing = pricingMode !== 'labor_only';
    const showLaborPricing = pricingMode !== 'material_only';
    const scheduleSections = buildProposalScheduleSections(lines, showMaterialPricing, showLaborPricing, summary.conditionLaborHoursMultiplier || 1);
    const conditionLines = summary.conditionAssumptions || [];
    const introSource = (proposalSettings.proposalIntro || DEFAULT_PROPOSAL_INTRO)
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)[0] || DEFAULT_PROPOSAL_INTRO;
    const introLines = doc.splitTextToSize(introSource, maxTextWidth);
    const terms = splitProposalTextLines(proposalSettings.proposalTerms || DEFAULT_PROPOSAL_TERMS);
    const exclusions = splitProposalTextLines(proposalSettings.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS);
    const clarifications = splitProposalTextLines(proposalSettings.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS);
    const acceptanceLabel = proposalSettings.proposalAcceptanceLabel || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL;
    const activeProjectDate = project.bidDate || project.proposalDate || project.dueDate;
    const proposalDate = activeProjectDate ? new Date(activeProjectDate).toLocaleDateString() : new Date().toLocaleDateString();
    const companyName = proposalSettings.companyName || 'Brighten Builders';
    const companyAddress = proposalSettings.companyAddress || '';
    const companyPhone = proposalSettings.companyPhone || '';
    const companyEmail = proposalSettings.companyEmail || '';
    const clientName = project.clientName || 'Client';
    const writeSectionTitle = (title: string, top: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(title.toUpperCase(), marginX, top);
    };
    const ensurePageSpace = (cursor: number, required: number): number => {
      if (cursor + required <= pageHeight - 48) return cursor;
      doc.addPage();
      return marginTop;
    };

    let cursorY = marginTop;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(15, 23, 42);
    doc.text(companyName, marginX, cursorY);

    cursorY += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    [companyAddress, companyPhone, companyEmail, companyWebsite].filter(Boolean).forEach((line) => {
      doc.text(String(line), marginX, cursorY);
      cursorY += 13;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text('Project Proposal', pageWidth - marginX, marginTop, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Prepared for ${clientName}`, pageWidth - marginX, marginTop + 18, { align: 'right' });
    doc.text(`Proposal date ${proposalDate}`, pageWidth - marginX, marginTop + 31, { align: 'right' });
    if (project.projectNumber) {
      doc.text(`Project #${project.projectNumber}`, pageWidth - marginX, marginTop + 44, { align: 'right' });
    }

    cursorY = Math.max(cursorY, marginTop + 72) + 16;
    writeSectionTitle('Introduction', cursorY);
    cursorY += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    introLines.forEach((line: string) => {
      cursorY = ensurePageSpace(cursorY, 16);
      doc.text(line, marginX, cursorY);
      cursorY += 15;
    });

    scheduleSections.forEach((section, index) => {
      cursorY += index === 0 ? 18 : 22;
      cursorY = ensurePageSpace(cursorY, 180);
      writeSectionTitle(section.section, cursorY);
      cursorY += 14;
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { fontSize: 8.75, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 255, 255] },
        margin: { left: marginX, right: marginX },
        head: [['Item / Description', 'Qty', 'Material Cost', 'Labor Cost']],
        body: section.items.map((item) => [
          item.description,
          formatNumberSafe(item.quantity, Number.isInteger(item.quantity) ? 0 : 2),
          formatCurrencySafe(item.materialCost),
          formatCurrencySafe(item.laborCost),
        ]),
        columnStyles: {
          0: { cellWidth: 286 },
          1: { halign: 'right', cellWidth: 55 },
          2: { halign: 'right', cellWidth: 90 },
          3: { halign: 'right', cellWidth: 90 },
        },
        didDrawPage: ({ pageNumber }) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(148, 163, 184);
          doc.text(`Proposal ${getProposalFileStem()} · Page ${pageNumber}`, pageWidth - marginX, pageHeight - 22, { align: 'right' });
        },
      });
      cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY) + 12;

      const totalsRows = [
        ['Total Material Cost', formatCurrencySafe(section.totalMaterialCost)],
        ['Total Labor Cost', formatCurrencySafe(section.totalLaborCost)],
        ['Estimated Install Duration', formatWorkWeeksLabel(calculateWorkDuration(section.totalLaborHours, project.jobConditions).durationWeeks)],
        ['Section Total', formatCurrencySafe(section.sectionTotal)],
      ];

      cursorY = ensurePageSpace(cursorY, 110);
      autoTable(doc, {
        startY: cursorY,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
        bodyStyles: { fillColor: [248, 250, 252] },
        margin: { left: pageWidth - marginX - 240, right: marginX },
        body: totalsRows,
        columnStyles: {
          0: { cellWidth: 150 },
          1: { halign: 'right', cellWidth: 90 },
        },
      });
      cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;
    });

    const writeBulletSection = (title: string, items: string[], minimumHeight = 80) => {
      cursorY += 20;
      cursorY = ensurePageSpace(cursorY, minimumHeight);
      writeSectionTitle(title, cursorY);
      cursorY += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);

      items.forEach((item) => {
        const wrapped = doc.splitTextToSize(`• ${item}`, maxTextWidth - 8);
        cursorY = ensurePageSpace(cursorY, wrapped.length * 12 + 4);
        doc.text(wrapped, marginX, cursorY);
        cursorY += wrapped.length * 12;
      });
    };

    if (conditionLines.length > 0) {
      writeBulletSection('Project Assumptions', conditionLines, 96);
    }
    if (project.specialNotes?.trim()) {
      writeBulletSection('Additional Notes', [project.specialNotes.trim()], 72);
    }

    cursorY += 20;
    cursorY = ensurePageSpace(cursorY, 140);
    writeSectionTitle('Project Totals', cursorY);
    cursorY += 14;
    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 5, textColor: [15, 23, 42], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
      margin: { left: marginX, right: marginX },
      head: [['Line', 'Amount']],
      body: [
        ['Total Material', formatCurrencySafe(showMaterialPricing ? summary.materialSubtotal : 0)],
        ['Total Labor', formatCurrencySafe(showLaborPricing ? summary.adjustedLaborSubtotal || summary.laborSubtotal : 0)],
        ['Estimated Install Duration', formatWorkWeeksLabel(summary.durationWeeks || 0)],
        ['Total Proposal Amount', formatCurrencySafe(summary.baseBidTotal)],
      ],
      columnStyles: {
        0: { cellWidth: 330 },
        1: { halign: 'right', cellWidth: 120 },
      },
    });
    cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursorY;

    writeBulletSection('Terms', terms, 96);
    writeBulletSection('Exclusions', exclusions, 96);
    writeBulletSection('Clarifications', clarifications, 96);

    cursorY += 26;
    cursorY = ensurePageSpace(cursorY, 92);
    writeSectionTitle('Acceptance', cursorY);
    cursorY += 24;
    doc.setDrawColor(148, 163, 184);
    doc.line(marginX, cursorY, marginX + 220, cursorY);
    doc.line(pageWidth - marginX - 180, cursorY, pageWidth - marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(acceptanceLabel, marginX, cursorY + 14);
    doc.text('Date', pageWidth - marginX - 180, cursorY + 14);

    doc.save(`${getProposalFileStem()}.pdf`);
  }

  async function submitBid() {
    if (!project) return;
    const nextStatus =
      project.status === 'Draft' || project.status === 'Lost'
        ? 'Submitted'
        : project.status === 'Submitted'
          ? 'Awarded'
          : project.status === 'Awarded'
            ? 'Archived'
            : 'Draft';

    try {
      const updated = await api.updateV1Project(project.id, { status: nextStatus });
      setProject(updated);
      setLastSavedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to update project status', error);
      window.alert('Unable to update project status right now.');
    }
  }

  async function saveProposalWording() {
    if (!settings) return;
    try {
      const saved = await api.updateV1Settings(settings);
      setSettings(ensureProposalDefaults(saved));
      setLastSavedAt(new Date().toISOString());
    } catch (error) {
      console.error('Failed to save proposal wording', error);
      window.alert('Unable to save proposal wording right now.');
    }
  }

  async function syncSheets() {
    setSyncState('syncing');
    try {
      await api.syncSheets();
      setSyncState('ok');
    } catch (error) {
      console.error(error);
      setSyncState('error');
    }
  }

  function openCreateRoomModal() {
    setRoomCreationDraft(DEFAULT_ROOM_CREATION_DRAFT);
    setRoomCreateModalOpen(true);
  }

  function closeCreateRoomModal(force = false) {
    if (creatingRoom && !force) return;
    setRoomCreateModalOpen(false);
    setRoomCreationDraft(DEFAULT_ROOM_CREATION_DRAFT);
  }

  async function createRoom() {
    if (!project || !roomCreationDraft.roomName.trim() || creatingRoom) return;

    setCreatingRoom(true);
    try {
      const room = await api.createV1Room({ projectId: project.id, roomName: roomCreationDraft.roomName.trim() });
      setRooms((prev) => [...prev, room]);
      setActiveRoomId(room.id);

      if (roomCreationDraft.addStarterLine && roomCreationDraft.starterDescription.trim()) {
        await api.createV1TakeoffLine({
          projectId: project.id,
          roomId: room.id,
          sourceType: 'manual',
          description: roomCreationDraft.starterDescription.trim(),
          qty: roomCreationDraft.starterQty > 0 ? roomCreationDraft.starterQty : 1,
          unit: roomCreationDraft.starterUnit.trim() || 'EA',
          materialCost: 0,
          laborMinutes: 0,
          laborCost: 0,
          notes: 'Starter line added during room creation',
        });
        await refreshTakeoff(project.id);
      }

      closeCreateRoomModal(true);
    } finally {
      setCreatingRoom(false);
    }
  }

  async function renameRoom(room: RoomRecord) {
    const nextName = window.prompt('Rename room', room.roomName);
    if (!nextName || nextName === room.roomName) return;
    const updated = await api.updateV1Room(room.id, { roomName: nextName });
    setRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)));
  }

  async function duplicateRoom(room: RoomRecord) {
    if (!project) return;
    const duplicated = await api.duplicateV1Room(room.id);
    setRooms((prev) => [...prev, duplicated]);
    await refreshTakeoff(project.id);
  }

  async function deleteRoom(room: RoomRecord) {
    if (!project) return;
    if (rooms.length <= 1) {
      window.alert('A project needs at least one room.');
      return;
    }
    if (!window.confirm('Delete this room and its items?')) return;

    await api.deleteV1Room(room.id);
    const nextRooms = rooms.filter((r) => r.id !== room.id);
    setRooms(nextRooms);
    if (activeRoomId === room.id && nextRooms.length) setActiveRoomId(nextRooms[0].id);
    await refreshTakeoff(project.id);
  }

  async function addManualLine() {
    if (!project || !activeRoomId) return;
    const created = await api.createV1TakeoffLine({
      projectId: project.id,
      roomId: activeRoomId,
      sourceType: 'manual',
      description: 'Manual item',
      qty: 1,
      unit: 'EA',
      materialCost: 0,
      laborMinutes: 0,
      laborCost: 0,
      notes: ''
    });
    setLines((prev) => [...prev, created]);
    setSelectedLineId(created.id);
    await refreshTakeoff(project.id);
  }

  async function addCatalogItemQuick(item: CatalogItem, qty = 1, roomId = activeRoomId) {
    if (!project || !roomId) return;
    const created = await api.createV1TakeoffLine({
      projectId: project.id,
      roomId,
      sourceType: 'catalog',
      sourceRef: item.sku || null,
      description: item.description,
      sku: item.sku,
      category: item.category,
      subcategory: item.subcategory || null,
      qty,
      unit: item.uom,
      materialCost: item.baseMaterialCost,
      laborMinutes: item.baseLaborMinutes,
      laborCost: 0,
      catalogItemId: item.id,
      notes: '',
    });
    setLines((prev) => [...prev, created]);
    setSelectedLineId(created.id);
    await refreshTakeoff(project.id);
  }

  async function persistLine(lineId: string, overrides?: Partial<TakeoffLineRecord>) {
    if (!project) return;
    const currentLine = lines.find((l) => l.id === lineId);
    const line = currentLine ? { ...currentLine, ...(overrides || {}) } : null;
    if (!line) return;
    const saved = await api.updateV1TakeoffLine(lineId, line);
    setLines((prev) => prev.map((item) => (item.id === lineId ? saved : item)));
    await refreshTakeoff(project.id);
  }

  async function deleteLine(lineId: string) {
    if (!project) return;
    await api.deleteV1TakeoffLine(lineId);
    setLines((prev) => prev.filter((line) => line.id !== lineId));
    if (selectedLineId === lineId) setSelectedLineId(null);
    await refreshTakeoff(project.id);
  }

  function openLineEditor(lineId: string) {
    setSelectedLineId(lineId);
    setEstimateEditorOpen(true);
  }

  async function applyModifier(modifierId: string) {
    if (!project || !selectedLineId) return;
    const result = await api.applyV1ModifierToLine(selectedLineId, modifierId);
    setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
    const updatedModifiers = await api.getV1LineModifiers(selectedLineId);
    setLineModifiers(updatedModifiers);
    setLineModifiersByLineId((prev) => ({ ...prev, [selectedLineId]: updatedModifiers }));
    await refreshTakeoff(project.id);
  }

  async function applyModifierToRoom(modifierId: string) {
    if (!project || activeRoomLines.length === 0) return;

    await Promise.all(activeRoomLines.map((line) => api.applyV1ModifierToLine(line.id, modifierId)));

    if (selectedLineId && activeRoomLines.some((line) => line.id === selectedLineId)) {
      const updatedModifiers = await api.getV1LineModifiers(selectedLineId);
      setLineModifiers(updatedModifiers);
      setLineModifiersByLineId((prev) => ({ ...prev, [selectedLineId]: updatedModifiers }));
    }

    await refreshTakeoff(project.id);
  }

  async function removeModifier(lineModifierId: string) {
    if (!project || !selectedLineId) return;
    const result = await api.removeV1LineModifier(selectedLineId, lineModifierId);
    setLines((prev) => prev.map((line) => (line.id === selectedLineId ? result.line : line)));
    const updatedModifiers = await api.getV1LineModifiers(selectedLineId);
    setLineModifiers(updatedModifiers);
    setLineModifiersByLineId((prev) => ({ ...prev, [selectedLineId]: updatedModifiers }));
    await refreshTakeoff(project.id);
  }

  async function applyBundle(bundleId: string, roomId = activeRoomId) {
    if (!project || !roomId) return;
    const created = await api.applyV1Bundle(bundleId, project.id, roomId);
    setLines((prev) => [...prev, ...created]);
    await refreshTakeoff(project.id);
  }

  async function addDraftItems(items: Array<{
    roomId: string;
    description: string;
    unit: string;
    qty: number;
    notes: string;
    sourceType: 'catalog' | 'manual';
    sku?: string | null;
    category?: string | null;
    subcategory?: string | null;
    materialCost: number;
    laborMinutes: number;
    catalogItemId?: string | null;
  }>) {
    if (!project) return;

    const created = await Promise.all(items.map((item) => api.createV1TakeoffLine({
      projectId: project.id,
      roomId: item.roomId,
      sourceType: item.sourceType,
      sourceRef: item.sku || null,
      description: item.description,
      sku: item.sku || null,
      category: item.category || null,
      subcategory: item.subcategory || null,
      qty: item.qty,
      unit: item.unit,
      materialCost: item.materialCost,
      laborMinutes: item.laborMinutes,
      laborCost: 0,
      catalogItemId: item.catalogItemId || null,
      notes: item.notes,
    })));

    setLines((prev) => [...prev, ...created]);
    await refreshTakeoff(project.id);
  }

  function toBase64Payload(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = result.indexOf(',');
        if (commaIndex < 0) {
          reject(new Error('Invalid file payload.'));
          return;
        }
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadProjectFile(file: File | undefined) {
    if (!project || !file) return;
    setFileUploading(true);
    try {
      const dataBase64 = await toBase64Payload(file);
      await api.uploadV1ProjectFile({
        projectId: project.id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataBase64,
      });
      setProjectFiles(await api.getV1ProjectFiles(project.id));
    } catch (error: any) {
      window.alert(error.message || 'File upload failed.');
    } finally {
      setFileUploading(false);
    }
  }

  async function removeProjectFile(fileId: string) {
    if (!project) return;
    if (!window.confirm('Delete this project file?')) return;
    await api.deleteV1ProjectFile(project.id, fileId);
    setProjectFiles((prev) => prev.filter((file) => file.id !== fileId));
  }

  async function generateProposalDraft(mode: 'scope_summary' | 'proposal_text' | 'terms_and_conditions' | 'default_short') {
    if (!project || !settings || !summary) return;

    setProposalDrafting(mode);
    try {
      const draft = await api.generateV1ProposalDraft({
        mode,
        project,
        lines,
        summary,
        settings,
      });

      const updates = Object.entries(draft).filter(([, value]) => typeof value === 'string' && value.trim().length > 0) as Array<[keyof SettingsRecord, string]>;
      const wouldOverwrite = updates.some(([key, value]) => String(settings[key] || '').trim().length > 0 && String(settings[key]).trim() !== value.trim());

      if (wouldOverwrite && !window.confirm('This will replace existing proposal text in one or more fields. Continue?')) {
        return;
      }

      const next = { ...settings } as SettingsRecord;
      updates.forEach(([key, value]) => {
        (next as any)[key] = value;
      });

      setSettings(ensureProposalDefaults(next));
      setActiveTab('proposal');
    } catch (error: any) {
      window.alert(error.message || 'Unable to generate proposal draft right now.');
    } finally {
      setProposalDrafting(null);
    }
  }

  async function generateInstallReviewEmail() {
    if (!project) return;

    setInstallReviewGenerating(true);
    try {
      const draft = await api.generateV1InstallReviewEmail(project.id);
      setInstallReviewDraft(draft);
      setActiveTab('proposal');
    } catch (error: any) {
      window.alert(error.message || 'Unable to generate install review email right now.');
    } finally {
      setInstallReviewGenerating(false);
    }
  }

  async function copyInstallReviewEmailBody() {
    if (!installReviewDraft) return;

    try {
      await navigator.clipboard.writeText(`Subject: ${installReviewDraft.subject}\n\n${installReviewDraft.body}`);
    } catch {
      window.alert('Unable to copy the install review email.');
    }
  }

  useEffect(() => {
    if (!project) {
      setProjectDateErrors({});
      return;
    }
    setProjectDateErrors(mapProjectDateErrors(collectPastProjectDateErrors({
      bidDate: project.bidDate,
      proposalDate: project.proposalDate,
      dueDate: project.dueDate,
    })));
  }, [project]);

  function resetProposalDefaults(scope: 'all' | 'intro' | 'terms' | 'exclusions' | 'clarifications' | 'acceptance') {
    if (!settings) return;

    const next = { ...settings };
    if (scope === 'all' || scope === 'intro') next.proposalIntro = DEFAULT_PROPOSAL_INTRO;
    if (scope === 'all' || scope === 'terms') next.proposalTerms = DEFAULT_PROPOSAL_TERMS;
    if (scope === 'all' || scope === 'exclusions') next.proposalExclusions = DEFAULT_PROPOSAL_EXCLUSIONS;
    if (scope === 'all' || scope === 'clarifications') next.proposalClarifications = DEFAULT_PROPOSAL_CLARIFICATIONS;
    if (scope === 'all' || scope === 'acceptance') next.proposalAcceptanceLabel = DEFAULT_PROPOSAL_ACCEPTANCE_LABEL;
    setSettings(ensureProposalDefaults(next));
  }

  if (loading || !project) {
    return <div className="p-8 text-sm text-slate-500">Loading workspace...</div>;
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <TopProjectHeader
        project={project}
        baseBidTotal={estimateViewSummary?.baseBidTotal || summary?.baseBidTotal || 0}
        syncState={syncState}
        lastSavedAt={lastSavedAt}
        onSave={saveProject}
        onPreviewProposal={previewProposal}
        onExport={exportProposal}
        onSubmitBid={submitBid}
        onDeleteProject={deleteProjectPermanently}
        statusActionLabel={statusActionLabel}
      />

      <div className="ui-page space-y-2 w-full max-w-full px-0">
        <p className="ui-label px-1">Project Workflow</p>
        <div className="ui-surface flex items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 shadow-sm">
          <button onClick={() => setActiveTab('overview')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'overview' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Overview</button>
          <button onClick={() => setActiveTab('setup')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'setup' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Project Setup</button>
          <button onClick={() => setActiveTab('rooms')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'rooms' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Rooms</button>
          <button onClick={() => setActiveTab('takeoff')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'takeoff' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Takeoff</button>
          <button onClick={() => setActiveTab('estimate')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'estimate' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Estimate</button>
          <button onClick={() => setActiveTab('files')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'files' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Files</button>
          <button onClick={() => setActiveTab('proposal')} className={`h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${activeTab === 'proposal' ? 'bg-blue-700 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-600'}`}>Proposal</button>
          <div className="flex items-center gap-1.5 pl-2 sm:ml-auto">
            <button onClick={() => void syncSheets()} className="ui-btn-secondary h-8 px-2.5 text-[11px] font-semibold">Sync</button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="ui-surface grid grid-cols-2 gap-2 p-3 text-sm md:grid-cols-3 xl:grid-cols-6">
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Project</p><p className="mt-1 font-semibold text-slate-900">{project.projectName}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Client</p><p className="mt-1 font-semibold text-slate-900">{project.clientName || 'N/A'}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Pricing</p><p className="mt-1 font-semibold text-slate-900">{pricingMode === 'material_only' ? 'Material Only' : pricingMode === 'labor_only' ? 'Install Only' : 'Material + Install'}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Rooms</p><p className="mt-1 font-semibold text-slate-900">{rooms.length}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Scope</p><p className="mt-1 font-semibold text-slate-900">{selectedScopeCategories.length || scopeCategoryOptions.length || 0} categories</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Live Estimate</p><p className="mt-1 font-semibold text-slate-900">{formatCurrencySafe(estimateViewSummary?.baseBidTotal || summary?.baseBidTotal || 0)}</p></div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
              <section className="rounded-2xl border border-slate-200/80 bg-white/92 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Project Snapshot</p>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Estimator assumptions at a glance</h2>
                  </div>
                  <button onClick={() => setActiveTab('setup')} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold">Open Project Setup</button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Install Labor Basis</p>
                    <p className="mt-1 font-semibold text-slate-900">{jobConditions.laborRateBasis === 'prevailing' ? 'Prevailing wage premium' : 'Union baseline labor'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Base {formatCurrencySafe(baseLaborRatePerHour)}/hr • Multiplier x{formatNumberSafe(jobConditions.laborRateMultiplier, 2)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Delivery + Project Adders</p>
                    <p className="mt-1 font-semibold text-slate-900">{jobConditions.deliveryRequired ? 'Delivery included in pricing' : 'No delivery allowance active'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{jobConditions.estimateAdderPercent ? `${formatNumberSafe(jobConditions.estimateAdderPercent, 2)}% adder` : '0% adder'} • {jobConditions.estimateAdderAmount ? `${formatCurrencySafe(jobConditions.estimateAdderAmount)} flat adder` : 'No flat adder'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Included Scope</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(selectedScopeCategories.length > 0 ? selectedScopeCategories : scopeCategoryOptions).slice(0, 10).map((category) => (
                        <span key={category} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">{category}</span>
                      ))}
                      {selectedScopeCategories.length === 0 && scopeCategoryOptions.length === 0 ? <span className="text-[11px] text-slate-500">No catalog categories loaded yet.</span> : null}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Special Notes</p>
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{project.specialNotes?.trim() || 'No project-wide special notes yet.'}</p>
                  </div>
                </div>
              </section>

              <aside className="space-y-3">
                <section className="rounded-2xl border border-slate-200/80 bg-white/92 p-3.5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Live Pricing Impact</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"><p className="text-slate-500">Labor Multiplier</p><p className="font-semibold text-slate-900">x{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p></div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"><p className="text-slate-500">Condition Adj.</p><p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p></div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 col-span-2"><p className="text-slate-500">Estimate Total</p><p className="font-semibold text-slate-900">{formatCurrencySafe(estimateViewSummary?.baseBidTotal || summary?.baseBidTotal || 0)}</p></div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200/80 bg-white/92 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Assumptions</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{(summary?.conditionAssumptions || []).length}</span>
                  </div>
                  {(summary?.conditionAssumptions || []).length > 0 ? (
                    <div className="mt-2 space-y-1.5 max-h-52 overflow-auto pr-1">
                      {(summary?.conditionAssumptions || []).slice(0, 8).map((assumption) => (
                        <p key={assumption} className="text-[11px] leading-4 text-slate-700">- {assumption}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-500">No project-level assumptions are active.</p>
                  )}
                </section>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px] items-start">
            <section className="rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Estimating Control Center</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">Project Setup</h2>
                  <p className="max-w-2xl text-[11px] text-slate-600">Core pricing inputs stay visible. Advanced project conditions are collapsed until needed.</p>
                </div>
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Project Identity</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Foundation</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Project Name<input className="ui-input mt-1 h-9" value={project.projectName} onChange={(e) => setProject({ ...project, projectName: e.target.value })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Client<input className="ui-input mt-1 h-9" value={project.clientName || ''} onChange={(e) => setProject({ ...project, clientName: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Project #<input className="ui-input mt-1 h-9" value={project.projectNumber || ''} onChange={(e) => setProject({ ...project, projectNumber: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Estimator<input className="ui-input mt-1 h-9" value={project.estimator || ''} onChange={(e) => setProject({ ...project, estimator: e.target.value || null })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Bid Due Date<input type="date" className={`ui-input mt-1 h-9 ${projectDateErrors.bidDate ? 'border-red-300 ring-1 ring-red-200' : ''}`} value={unifiedProjectDate} onChange={(e) => patchProjectDate(e.target.value)} />{projectDateErrors.bidDate ? <span className="mt-1 block text-[11px] text-red-600">{projectDateErrors.bidDate}</span> : null}</label>
                    <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Address<input className="ui-input mt-1 h-9" value={project.address || ''} onChange={(e) => setProject({ ...project, address: e.target.value || null })} onBlur={() => void refreshProjectDistance()} /></label>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Pricing Basis</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Material / Install / Rates</span>
                  </div>
                  <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs text-slate-700">
                    <p className="font-medium text-slate-900">Base labor rate in use: {formatCurrencySafe(baseLaborRatePerHour)}/hr</p>
                    <p className="mt-1">This starting rate comes from Settings and is used for line labor pricing before project-wide labor multipliers and adders are applied.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Pricing Basis
                      <select
                        className="ui-input mt-1 h-9"
                        value={project.pricingMode || 'labor_and_material'}
                        onChange={(e) => setProject({ ...project, pricingMode: e.target.value as ProjectRecord['pricingMode'] })}
                      >
                        <option value="material_only">Material Only</option>
                        <option value="labor_only">Install Only</option>
                        <option value="labor_and_material">Material + Install</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Location / Region<input className="ui-input mt-1 h-9" value={jobConditions.locationLabel} onChange={(e) => patchJobConditions({ locationLabel: e.target.value })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Material Tax %<input type="number" className="ui-input mt-1 h-9" value={project.taxPercent} onChange={(e) => setProject({ ...project, taxPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Location Tax Override %<input type="number" className="ui-input mt-1 h-9" value={jobConditions.locationTaxPercent ?? ''} onChange={(e) => patchJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Install Labor Basis
                      <select className="ui-input mt-1 h-9" value={jobConditions.laborRateBasis} onChange={(e) => patchJobConditions({ laborRateBasis: e.target.value as ProjectJobConditions['laborRateBasis'] })}>
                        <option value="union">Union Baseline</option>
                        <option value="prevailing">Prevailing Wage Premium</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.laborRateMultiplier} onChange={(e) => patchJobConditions({ laborRateMultiplier: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Installers / Crew Size<input type="number" min={1} className="ui-input mt-1 h-9" value={jobConditions.installerCount} onChange={(e) => patchJobConditions({ installerCount: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Labor Burden %<input type="number" className="ui-input mt-1 h-9" value={project.laborBurdenPercent} onChange={(e) => setProject({ ...project, laborBurdenPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Overhead %<input type="number" className="ui-input mt-1 h-9" value={project.overheadPercent} onChange={(e) => setProject({ ...project, overheadPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Profit %<input type="number" className="ui-input mt-1 h-9" value={project.profitPercent} onChange={(e) => setProject({ ...project, profitPercent: Number(e.target.value) || 0 })} /></label>
                  </div>
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                    <div>
                      <p className="font-medium text-slate-900">Job Distance From Office</p>
                      <p className="mt-1">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} miles from office` : 'No calculated distance yet.'}</p>
                      {distanceError ? <p className="mt-1 text-red-600">{distanceError}</p> : null}
                    </div>
                    <button onClick={() => void refreshProjectDistance()} disabled={distanceCalculating} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold disabled:opacity-50">
                      {distanceCalculating ? 'Calculating...' : 'Recalculate Distance'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-900">Union labor baseline</p>
                      <p className="text-[11px] text-slate-500">Install labor pricing now assumes union wage as the default baseline. Use prevailing wage only when the project requires a premium above baseline labor.</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.prevailingWage} onChange={(e) => patchJobConditions({ prevailingWage: e.target.checked })} />Prevailing Wage</label>
                      <p className="text-[11px] text-slate-500">Use only when the project requires a premium above the default union install labor baseline.</p>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.prevailingWageMultiplier} onChange={(e) => patchJobConditions({ prevailingWageMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.smallJobFactor} onChange={(e) => patchJobConditions({ smallJobFactor: e.target.checked })} />Small Job Factor</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.smallJobMultiplier} onChange={(e) => patchJobConditions({ smallJobMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Rooms / Included Scope</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Scope Definition</span>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Rooms / Areas</p>
                      <p className="text-xs text-slate-500 mt-1">{rooms.length} room(s) currently define how takeoff and estimate lines are organized.</p>
                    </div>
                    <button onClick={() => setActiveTab('rooms')} className="ui-btn-secondary h-8 px-3 text-[11px] font-semibold">Manage Rooms</button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">Included Catalog Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {scopeCategoryOptions.map((category) => {
                        const active = selectedScopeCategories.includes(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => toggleScopeCategory(category)}
                            className={`px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${active ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>
                    {scopeCategoryOptions.length === 0 ? <p className="text-xs text-slate-500">Catalog categories will appear here after catalog sync.</p> : null}
                  </div>
                </div>

                <div className="border-t border-slate-200/80 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Advanced Project Conditions</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Project-wide labor drivers, delivery rules, and execution adders.</p>
                    </div>
                    <button type="button" onClick={() => setSetupAdvancedOpen((value) => !value)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">{setupAdvancedOpen ? 'Hide Advanced' : 'Show Advanced'}</button>
                  </div>
                  {!setupAdvancedOpen ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-900">Currently active:</span> {activeProjectLaborDrivers.length} labor driver{activeProjectLaborDrivers.length === 1 ? '' : 's'} • {projectCostAdderDetails.length} cost adder{projectCostAdderDetails.length === 1 ? '' : 's'}
                    </div>
                  ) : (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="text-[11px] font-medium text-slate-700">Floors<input type="number" min={1} className="ui-input mt-1 h-9" value={jobConditions.floors} onChange={(e) => patchJobConditions({ floors: Number(e.target.value) || 1 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Floor Labor Add / Floor<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.floorMultiplierPerFloor} onChange={(e) => patchJobConditions({ floorMultiplierPerFloor: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Delivery Difficulty
                      <select className="ui-input mt-1 h-9" value={jobConditions.deliveryDifficulty} onChange={(e) => {
                        const difficulty = e.target.value as ProjectJobConditions['deliveryDifficulty'];
                        patchJobConditions({ deliveryDifficulty: difficulty });
                        if (jobConditions.deliveryAutoCalculated) {
                          applyWorkspaceDeliveryRecommendation(jobConditions.travelDistanceMiles, { difficulty, force: true });
                        }
                      }}>
                        <option value="standard">Standard</option>
                        <option value="constrained">Constrained</option>
                        <option value="difficult">Difficult</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Mobilization Complexity
                      <select className="ui-input mt-1 h-9" value={jobConditions.mobilizationComplexity} onChange={(e) => patchJobConditions({ mobilizationComplexity: e.target.value as ProjectJobConditions['mobilizationComplexity'] })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">Project Adder %<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.estimateAdderPercent} onChange={(e) => patchJobConditions({ estimateAdderPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-[11px] font-medium text-slate-700">Project Adder $<input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.estimateAdderAmount} onChange={(e) => patchJobConditions({ estimateAdderAmount: Number(e.target.value) || 0 })} /></label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:col-span-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px_180px] gap-3 items-end">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.deliveryRequired} onChange={(e) => {
                        if (!e.target.checked) {
                          patchJobConditions({ deliveryRequired: false, deliveryAutoCalculated: false });
                          return;
                        }

                        applyWorkspaceDeliveryRecommendation(jobConditions.travelDistanceMiles, { force: true });
                      }} />Delivery is included in this job</label>
                      <label className="text-[11px] font-medium text-slate-700">Delivery Pricing Mode
                        <select className="ui-input mt-1 h-9" value={jobConditions.deliveryPricingMode} onChange={(e) => patchJobConditions({ deliveryPricingMode: e.target.value as ProjectJobConditions['deliveryPricingMode'], deliveryAutoCalculated: false })}>
                          <option value="included">Included / No Charge</option>
                          <option value="flat">Flat Amount</option>
                          <option value="percent">Percent of Base</option>
                        </select>
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Delivery Value
                        <input type="number" step="0.01" className="ui-input mt-1 h-9" value={jobConditions.deliveryValue} onChange={(e) => patchJobConditions({ deliveryValue: Number(e.target.value) || 0, deliveryAutoCalculated: false })} />
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Lead Time (business days)
                        <input type="number" min={0} className="ui-input mt-1 h-9" value={jobConditions.deliveryLeadDays} onChange={(e) => patchJobConditions({ deliveryLeadDays: Number(e.target.value) || 0, deliveryAutoCalculated: false })} />
                      </label>
                      <div className="md:col-span-4 rounded-xl border border-dashed border-slate-300 bg-white/80 px-3 py-2 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-900">Auto delivery:</span> {jobConditions.deliveryRequired ? `${formatCurrencySafe(jobConditions.deliveryValue)} and ${jobConditions.deliveryLeadDays} business day${jobConditions.deliveryLeadDays === 1 ? '' : 's'} from the job address.` : 'Add or recalculate the address to auto-fill delivery.'}
                        <button type="button" onClick={() => applyWorkspaceDeliveryRecommendation(jobConditions.travelDistanceMiles, { force: true })} className="ml-2 font-semibold text-blue-700 hover:text-blue-800">Refresh recommendation</button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.elevatorAvailable} onChange={(e) => patchJobConditions({ elevatorAvailable: e.target.checked })} />Elevator Available</label>
                      <p className="text-[11px] text-slate-500">If unchecked on multi-floor work, labor increases automatically.</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.occupiedBuilding} onChange={(e) => patchJobConditions({ occupiedBuilding: e.target.checked })} />Occupied Building</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.occupiedBuildingMultiplier} onChange={(e) => patchJobConditions({ occupiedBuildingMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.restrictedAccess} onChange={(e) => patchJobConditions({ restrictedAccess: e.target.checked })} />Restricted Access</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.restrictedAccessMultiplier} onChange={(e) => patchJobConditions({ restrictedAccessMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.remoteTravel} onChange={(e) => patchJobConditions({ remoteTravel: e.target.checked })} />Remote / Travel Job</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.remoteTravelMultiplier} onChange={(e) => patchJobConditions({ remoteTravelMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.nightWork} onChange={(e) => patchJobConditions({ nightWork: e.target.checked, afterHoursWork: e.target.checked })} />Night Work</label>
                      <p className="text-[11px] text-slate-500">Applies automatically across all scoped install items.</p>
                      <label className="text-[11px] font-medium text-slate-700">Labor Cost Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.nightWorkLaborCostMultiplier} onChange={(e) => patchJobConditions({ nightWorkLaborCostMultiplier: Number(e.target.value) || 0, afterHoursMultiplier: Number(e.target.value) || 0 })} /></label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Hours Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.nightWorkLaborMinutesMultiplier} onChange={(e) => patchJobConditions({ nightWorkLaborMinutesMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.phasedWork} onChange={(e) => promptForPhasedWork(e.target.checked)} />Phased Work</label>
                      {jobConditions.phasedWork ? <label className="text-[11px] font-medium text-slate-700">Phase Count<input type="number" min={2} className="ui-input mt-1 h-8" value={jobConditions.phasedWorkPhases} onChange={(e) => {
                        const phaseCount = Math.max(2, Number(e.target.value) || 2);
                        patchJobConditions({ phasedWorkPhases: phaseCount, phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount) });
                      }} /></label> : null}
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.phasedWorkMultiplier} onChange={(e) => patchJobConditions({ phasedWorkMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 md:col-span-2 xl:col-span-1">
                      <label className="text-xs text-slate-700 flex items-center gap-2"><input type="checkbox" checked={jobConditions.scheduleCompression} onChange={(e) => patchJobConditions({ scheduleCompression: e.target.checked })} />Schedule Compression</label>
                      <label className="text-[11px] font-medium text-slate-700">Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1 h-8" value={jobConditions.scheduleCompressionMultiplier} onChange={(e) => patchJobConditions({ scheduleCompressionMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                  </div>
                  </>
                  )}
                </div>

                <div className="border-t border-slate-200/80 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Special Notes</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Clarify Scope</span>
                  </div>
                  <label className="text-[11px] font-medium text-slate-700 block">Project Special Notes
                    <textarea className="ui-input mt-1 min-h-[112px] py-2" value={project.specialNotes || ''} onChange={(e) => setProject({ ...project, specialNotes: e.target.value || null })} placeholder="Delivery restrictions, coordination assumptions, exclusions, alternates, or anything that should be visible in overview and proposal drafting." />
                  </label>
                </div>
              </div>
            </section>

            <aside className="space-y-3 xl:sticky xl:top-[88px]">
              <section className="rounded-2xl border border-slate-200/80 bg-white/92 shadow-sm p-3.5">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Setup Impact Summary</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Installers</p>
                    <p className="font-semibold text-slate-900">{jobConditions.installerCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Distance</p>
                    <p className="font-semibold text-slate-900">{jobConditions.travelDistanceMiles !== null ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} mi` : 'n/a'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Delivery Lead</p>
                    <p className="font-semibold text-slate-900">{jobConditions.deliveryLeadDays || 0} day{jobConditions.deliveryLeadDays === 1 ? '' : 's'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Labor Multiplier</p>
                    <p className="font-semibold text-slate-900">x{formatNumberSafe(summary?.conditionLaborMultiplier || 1, 2)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-slate-500">Condition Adj.</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.conditionAdjustmentAmount)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 col-span-2">
                    <p className="text-slate-500">Adjusted Labor Subtotal</p>
                    <p className="font-semibold text-slate-900">{formatCurrencySafe(summary?.adjustedLaborSubtotal)}</p>
                  </div>
                </div>
                {(summary?.conditionAssumptions || []).length > 0 ? (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Active Assumptions</p>
                    <div className="mt-2 space-y-1.5 max-h-40 overflow-auto pr-1">
                    {(summary?.conditionAssumptions || []).slice(0, 12).map((assumption) => (
                      <p key={assumption} className="text-xs text-slate-700 leading-4">- {assumption}</p>
                    ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No project-level assumptions are active.</p>
                )}
              </section>

              <CrewRecommendationCard crew={summary?.crewRecommendation} manualInstallerCount={jobConditions.installerCount} />

              <section className="rounded-2xl border border-slate-200/80 bg-white/92 shadow-sm p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">Scope + Navigation</p>
                  <button onClick={() => setActiveTab('rooms')} className="text-[11px] font-medium text-blue-700 hover:text-blue-800">Open Rooms</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedScopeCategories.length > 0 ? selectedScopeCategories.map((category) => (
                    <span key={category} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] border border-slate-200">{category}</span>
                  )) : <p className="text-xs text-slate-500">No categories selected yet.</p>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
                  {rooms.slice(0, 6).map((room) => (
                    <span key={room.id} className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] border border-slate-200">{room.roomName}</span>
                  ))}
                  {rooms.length > 6 && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] border border-slate-200">+{rooms.length - 6} more</span>}
                </div>
                <button onClick={() => setActiveTab('proposal')} className="ui-btn-secondary mt-1 h-8 px-3 text-[11px] font-semibold">Open Proposal</button>
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <RoomManager
              rooms={rooms}
              activeRoomId={activeRoomId}
              onSelectRoom={setActiveRoomId}
              onOpenCreateRoom={openCreateRoomModal}
              onRenameRoom={(room) => void renameRoom(room)}
              onDuplicateRoom={(room) => void duplicateRoom(room)}
              onDeleteRoom={(room) => void deleteRoom(room)}
            />

            <section className="space-y-3 rounded-[22px] border border-slate-200/80 bg-white/94 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Rooms</p>
                  <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950">{roomNamesById[activeRoomId] || 'Select a room'}</h3>
                  <p className="mt-1 text-[11px] text-slate-600">Keep room organization simple here, then do most item and add-in work in Takeoff and Estimate.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <button onClick={() => setActiveTab('takeoff')} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50">Open Takeoff</button>
                  <button onClick={() => setActiveTab('estimate')} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50">Open Estimate</button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Rooms</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{rooms.length}</p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Active Room Lines</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{activeRoomLines.length}</p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Room Subtotal</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Room Qty</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{activeRoomLines.reduce((sum, line) => sum + Number(line.qty || 0), 0)}</p>
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-900">Active Room Lines</p>
                  <span className="text-[10px] text-slate-500">Preview</span>
                </div>
                {activeRoomLines.length > 0 ? (
                  <div className="mt-2 divide-y divide-slate-200/80 overflow-hidden rounded-[14px] border border-slate-200 bg-white">
                    {activeRoomLines.slice(0, 8).map((line) => (
                      <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{line.description}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{line.category || 'Uncategorized'} • Qty {line.qty} {line.unit}</p>
                        </div>
                        <span className="font-semibold text-slate-900">{formatCurrencySafe(line.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-[14px] border border-dashed border-slate-300 bg-white px-3 py-5 text-[11px] text-slate-500">Select or create a room, then add lines from Takeoff or Estimate.</div>
                )}
                {activeRoomLines.length > 8 ? <p className="mt-2 text-[10px] text-slate-500">Showing 8 of {activeRoomLines.length} lines in this room.</p> : null}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'takeoff' && (
          <div className="min-w-0 rounded-[28px] bg-[linear-gradient(180deg,#fff8ee_0%,#fdf8f2_100%)] p-2.5 shadow-[0_16px_36px_rgba(15,23,42,0.06)] ring-1 ring-amber-200/80 sm:p-3">
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 space-y-3">
                <WorkspaceToolbar
                  tone="takeoff"
                  eyebrow="Takeoff"
                  title="Quantity, Match, and Scope Review"
                  description="Use this workspace to review extracted lines, confirm quantities, clean up unresolved items, and apply room or project conditions before pricing review."
                  actions={(
                    <>
                      <button onClick={() => setTakeoffRoomsModalOpen(true)} className="inline-flex h-8 items-center rounded-full border border-amber-200 bg-white px-3 text-[10px] font-semibold text-slate-700">Rooms</button>
                      <button onClick={() => setCatalogOpen(true)} className="inline-flex h-8 items-center rounded-full bg-[linear-gradient(135deg,#b7791f_0%,#8d5b12_100%)] px-3 text-[10px] font-semibold text-white shadow-[0_10px_22px_rgba(183,121,31,0.18)]">Catalog Match</button>
                    </>
                  )}
                  controls={(
                    <div className="grid gap-2 lg:grid-cols-[1.2fr_repeat(5,minmax(0,auto))]">
                      <label className="text-[11px] font-medium text-slate-700">Search item or SKU
                        <input value={takeoffSearch} onChange={(event) => setTakeoffSearch(event.target.value)} className="ui-input mt-1 h-9 rounded-xl border-amber-200" placeholder="Search item, SKU, room, or notes" />
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Room scope
                        <select value={activeRoomId} onChange={(event) => setActiveRoomId(event.target.value)} className="ui-input mt-1 h-9 rounded-xl">
                          {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">View scope
                        <select value={workspaceScopeMode} onChange={(event) => setWorkspaceScopeMode(event.target.value as WorkspaceScopeMode)} className="ui-input mt-1 h-9 rounded-xl">
                          <option value="active">Active room</option>
                          <option value="all">All rooms</option>
                        </select>
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Group by
                        <select value={takeoffGroupMode} onChange={(event) => setTakeoffGroupMode(event.target.value as WorkspaceGroupMode)} className="ui-input mt-1 h-9 rounded-xl">
                          <option value="room">Room</option>
                          <option value="category">Category</option>
                        </select>
                      </label>
                      <label className="text-[11px] font-medium text-slate-700">Match status
                        <select value={takeoffMatchStatus} onChange={(event) => setTakeoffMatchStatus(event.target.value as TakeoffMatchStatus)} className="ui-input mt-1 h-9 rounded-xl">
                          <option value="all">All lines</option>
                          <option value="matched">Matched only</option>
                          <option value="unmatched">Unmatched only</option>
                        </select>
                      </label>
                      <label className="mt-6 inline-flex items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] font-medium text-slate-700">
                        <input type="checkbox" checked={takeoffUnresolvedOnly} onChange={(event) => setTakeoffUnresolvedOnly(event.target.checked)} />
                        Show unresolved only
                      </label>
                    </div>
                  )}
                  summaryBar={(
                    <div className="rounded-[16px] bg-amber-50/70 px-3 py-2 text-[11px] text-slate-700 ring-1 ring-amber-200/70">
                      Base labor {formatCurrencySafe(baseLaborRatePerHour)}/hr · Effective {formatCurrencySafe(takeoffEffectiveLaborRatePerHour)}/hr · {activeProjectLaborDrivers.length} labor drivers · {projectCostAdderDetails.length} cost adders · {takeoffFilteredLines.length} visible lines · {formatNumberSafe(takeoffQuantity, 2)} total qty · subtotal {formatCurrencySafe(takeoffSubtotal)} · {takeoffUnresolvedCount} unresolved
                    </div>
                  )}
                />

                <div className="rounded-[16px] bg-white/92 px-3 py-2 ring-1 ring-amber-200/70 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="min-w-0 text-slate-600">
                      <span className="font-semibold text-slate-900">Review focus:</span>{' '}
                      <span className="truncate">{selectedLine ? `${selectedLine.description} · ${roomNamesById[selectedLine.roomId] || 'Unassigned room'}` : `${workspaceScopeMode === 'all' ? 'All visible rooms' : roomNamesById[activeRoomId] || 'Active room'} · quantity review`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedLine ? <span className="text-slate-500">Qty {selectedLine.qty} · {(lineModifiersByLineId[selectedLine.id] || []).length} conditions</span> : <span className="text-slate-500">Select a line to inspect source and match context</span>}
                      {selectedLine ? <button onClick={() => setSelectedLineId(null)} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-semibold text-slate-700">Clear</button> : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-amber-200/80 bg-white/98 p-1 shadow-sm">
                  <EstimateGrid
                    lines={takeoffFilteredLines}
                    rooms={rooms}
                    categories={categories}
                    roomNamesById={roomNamesById}
                    pricingMode={pricingMode}
                    viewMode="takeoff"
                    organizeBy={takeoffGroupMode}
                    laborMultiplier={summary?.conditionLaborMultiplier || 1}
                    lineModifiersByLineId={lineModifiersByLineId}
                    selectedLineId={selectedLineId}
                    onSelectLine={setSelectedLineId}
                    onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                    onDeleteLine={(lineId) => void deleteLine(lineId)}
                  />
                </div>
              </section>

              <EstimateSidebar
                mode="takeoff"
                activeTab={takeoffSidebarTab}
                onTabChange={setTakeoffSidebarTab}
                rooms={rooms}
                activeRoomId={activeRoomId}
                activeRoomName={roomNamesById[activeRoomId] || 'Active room'}
                activeRoomLineCount={activeRoomLines.length}
                bundles={bundles}
                categories={categories}
                filteredCatalog={filteredCatalog}
                catalogSearch={catalogSearch}
                catalogCategory={catalogCategory}
                selectedLine={selectedLine}
                modifiers={modifiers}
                activeLineModifiers={selectedLineId ? (lineModifiersByLineId[selectedLineId] || lineModifiers) : []}
                jobConditions={jobConditions}
                baseLaborRatePerHour={baseLaborRatePerHour}
                effectiveLaborRatePerHour={takeoffEffectiveLaborRatePerHour}
                projectLaborMultiplier={takeoffLaborMultiplier}
                roomNamesById={roomNamesById}
                unresolvedLines={takeoffFilteredLines}
                selectedLineId={selectedLineId}
                summary={estimateViewSummary}
                currentScopeLabel={workspaceScopeMode === 'all' ? 'all rooms' : roomNamesById[activeRoomId] || 'active room'}
                onCatalogSearch={setCatalogSearch}
                onCatalogCategory={setCatalogCategory}
                onAddCatalogItem={(item, qty, roomId) => void addCatalogItemQuick(item, qty, roomId)}
                onAddBundle={(bundleId, roomId) => void applyBundle(bundleId, roomId)}
                onAddManualLine={() => void addManualLine()}
                onApplyLineModifier={(modifierId) => void applyModifier(modifierId)}
                onApplyRoomModifier={(modifierId) => void applyModifierToRoom(modifierId)}
                onRemoveLineModifier={(lineModifierId) => void removeModifier(lineModifierId)}
                onPatchJobConditions={patchJobConditions}
                onSelectLine={setSelectedLineId}
              />
            </div>
          </div>
        )}

        {activeTab === 'estimate' && (
          <div className="w-full h-[calc(100vh-56px)] flex flex-col bg-white p-0 m-0 min-w-0 max-w-full">
            {/* Toolbar/Header */}
            <div className="flex-none w-full min-w-0 max-w-full border-b border-slate-200 bg-white px-4 py-2 flex items-center gap-2" style={{height:56}}>
              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">Estimate</span>
              <div className="flex flex-1 gap-2 items-center min-w-0">
                <label className="sr-only" htmlFor="estimate-group-mode">Group by</label>
                <select
                  id="estimate-group-mode"
                  value={estimateGroupMode}
                  onChange={(event) => setEstimateGroupMode(event.target.value as WorkspaceGroupMode)}
                  className="ui-input h-10 min-w-[140px] rounded-lg text-[14px] font-semibold border-2 border-blue-700 bg-white text-blue-900 shadow-sm focus:ring-2 focus:ring-blue-200"
                >
                  <option value="room">Group: Room</option>
                  <option value="category">Group: Category</option>
                </select>
                <input
                  value={estimateSearch}
                  onChange={(event) => setEstimateSearch(event.target.value)}
                  className="ui-input h-9 rounded-lg text-[13px] flex-1 min-w-[180px]"
                  placeholder="Search item, SKU, room"
                  aria-label="Search items"
                />
              </div>
              {selectedLine && (
                <button onClick={() => setEstimateEditorOpen((value) => !value)} className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-white">
                  {estimateEditorOpen ? 'Hide Edit' : 'Edit'}
                </button>
              )}
            </div>

            {/* Summary Bar */}
            <div className="flex-none w-full min-w-0 max-w-full border-b border-slate-200 bg-slate-50/92 px-4 py-1.5 flex items-center text-[11px] text-slate-700 shadow-sm">
              <span className="font-semibold text-slate-900">Material:</span> {formatCurrencySafe(estimateViewSummary?.materialSubtotal || 0)}
              <span className="font-semibold text-slate-900 ml-2">Labor:</span> {formatCurrencySafe(estimateViewSummary?.adjustedLaborSubtotal || estimateViewSummary?.laborSubtotal || 0)}
              <span className="font-semibold text-slate-900 ml-2">Sell:</span> {formatCurrencySafe(estimateViewSummary?.baseBidTotal || 0)}
              <span className="font-semibold text-slate-900 ml-2">Lines:</span> {estimateFilteredLines.length}
            </div>

            {/* Main Content Split */}
            <div className="flex-1 min-h-0 min-w-0 max-w-full flex flex-row overflow-hidden" style={{height:'auto'}}>
              {/* Main Table/Editor Area */}
              <section className="flex-1 min-w-0 min-h-0 flex flex-col space-y-2 overflow-hidden">
                <div className="flex-none w-full min-w-0 max-w-full border-b border-slate-200 bg-white/94 px-4 py-1.5 text-[11px] text-slate-700 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-950">Selected:</span>
                    <span className="min-w-0 flex-1 truncate">{selectedLine ? selectedLine.description : `${workspaceScopeMode === 'all' ? 'All visible rooms' : roomNamesById[activeRoomId] || 'Active room'} · pricing review`}</span>
                    <span className="text-slate-500">{selectedLine ? (roomNamesById[selectedLine.roomId] || 'Unassigned room') : `${activeProjectLaborDrivers.length} labor drivers`}</span>
                    <span className="text-slate-500">{selectedLine ? `${selectedLineModifierCount} conditions` : `${projectCostAdderDetails.length} cost adders`}</span>
                    {selectedLine ? <button onClick={() => setEstimateEditorOpen((value) => !value)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-white">{estimateEditorOpen ? 'Hide Edit' : 'Edit'}</button> : null}
                    {selectedLine ? <button onClick={() => setSelectedLineId(null)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50">Clear</button> : null}
                  </div>
                </div>

                {selectedLine && estimateEditorOpen ? (
                  <div className="flex-none w-full min-w-0 max-w-full">
                    <EstimateSelectedLineEditor
                      line={selectedLine}
                      rooms={rooms}
                      roomNamesById={roomNamesById}
                      showMaterial={showMaterial}
                      showLabor={showLabor}
                      projectLaborMultiplier={estimateViewSummary?.conditionLaborMultiplier || 1}
                      activeModifiers={selectedLineId ? (lineModifiersByLineId[selectedLineId] || lineModifiers) : []}
                      onPatchLine={patchLineLocal}
                      onPersistLine={(lineId) => void persistLine(lineId)}
                      onResetLinePrice={(lineId) => void resetLineToCalculatedPrice(lineId)}
                      onClearSelection={() => setSelectedLineId(null)}
                    />
                  </div>
                ) : null}

                <div className="flex-1 min-h-0 min-w-0 max-w-full overflow-hidden">
                  <div className="rounded-[14px] border border-slate-200/80 bg-white/98 p-0.5 shadow-sm h-full min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col">
                    <EstimateGrid
                      lines={estimateFilteredLines}
                      rooms={rooms}
                      categories={categories}
                      roomNamesById={roomNamesById}
                      pricingMode={pricingMode}
                      viewMode="estimate"
                      organizeBy={estimateGroupMode}
                      laborMultiplier={estimateViewSummary?.conditionLaborMultiplier || 1}
                      lineModifiersByLineId={lineModifiersByLineId}
                      compactMode={estimateCompactMode}
                      selectedLineId={selectedLineId}
                      onSelectLine={setSelectedLineId}
                      onPersistLine={(lineId, updates) => void persistLine(lineId, updates)}
                      onDeleteLine={(lineId) => void deleteLine(lineId)}
                    />
                  </div>
                </div>
              </section>

              {/* Utility/Sidebar Panel */}
              <div className={`flex-none min-h-0 max-h-full min-w-0 ${estimateSidebarCollapsed ? 'w-[52px]' : 'w-[320px]'} transition-all duration-200`} style={{overflow:'hidden'}}>
                <EstimateSidebar
                  mode="estimate"
                  collapsed={estimateSidebarCollapsed}
                  onToggleCollapse={() => setEstimateSidebarCollapsed((value) => !value)}
                  activeTab={estimateSidebarTab}
                  onTabChange={setEstimateSidebarTab}
                  rooms={rooms}
                  activeRoomId={activeRoomId}
                  activeRoomName={roomNamesById[activeRoomId] || 'Active room'}
                  activeRoomLineCount={activeRoomLines.length}
                  bundles={bundles}
                  categories={categories}
                  filteredCatalog={filteredCatalog}
                  catalogSearch={catalogSearch}
                  catalogCategory={catalogCategory}
                  selectedLine={selectedLine}
                  modifiers={modifiers}
                  activeLineModifiers={selectedLineId ? (lineModifiersByLineId[selectedLineId] || lineModifiers) : []}
                  jobConditions={jobConditions}
                  baseLaborRatePerHour={baseLaborRatePerHour}
                  effectiveLaborRatePerHour={estimateEffectiveLaborRatePerHour}
                  projectLaborMultiplier={estimateLaborMultiplier}
                  roomNamesById={roomNamesById}
                  unresolvedLines={estimateFilteredLines}
                  selectedLineId={selectedLineId}
                  summary={estimateViewSummary}
                  currentScopeLabel={workspaceScopeMode === 'all' ? 'all rooms' : roomNamesById[activeRoomId] || 'active room'}
                  onCatalogSearch={setCatalogSearch}
                  onCatalogCategory={setCatalogCategory}
                  onAddCatalogItem={(item, qty, roomId) => void addCatalogItemQuick(item, qty, roomId)}
                  onAddBundle={(bundleId, roomId) => void applyBundle(bundleId, roomId)}
                  onAddManualLine={() => void addManualLine()}
                  onApplyLineModifier={(modifierId) => void applyModifier(modifierId)}
                  onApplyRoomModifier={(modifierId) => void applyModifierToRoom(modifierId)}
                  onRemoveLineModifier={(lineModifierId) => void removeModifier(lineModifierId)}
                  onPatchJobConditions={patchJobConditions}
                  onSelectLine={setSelectedLineId}
                />
              </div>
            </div>

            {/* Sticky Running Total Bar */}
            <div className="flex-none w-full min-w-0 max-w-full">
              <EstimateRunningTotalBar
                summary={estimateViewSummary}
                lines={estimateFilteredLines}
                currentViewLabel={workspaceScopeMode === 'all' ? 'All Rooms In View' : roomNamesById[activeRoomId] || 'Active Room'}
                currentViewTotal={estimateSubtotal}
              />
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-3">
            <section className="rounded-[22px] border border-slate-200/80 bg-white/94 p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project Files</p>
                  <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950">Keep source files attached to the estimate</h3>
                  <p className="mt-1 text-[11px] text-slate-600">Use this as the single reference set for imports, proposal support, and future revisions.</p>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-4 text-[10px] font-semibold text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)] hover:brightness-[1.03]">
                  <FileUp className="h-4 w-4" />
                  {fileUploading ? 'Uploading...' : 'Upload File'}
                  <input type="file" className="hidden" onChange={(e) => void uploadProjectFile(e.target.files?.[0])} disabled={fileUploading} />
                </label>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Files Stored</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{projectFiles.length}</p>
                </div>
                <div className="rounded-[16px] border border-blue-200 bg-[var(--brand-soft)] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-blue-800">Latest Upload</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">{projectFiles[0]?.fileName || 'No uploads yet'}</p>
                </div>
                <div className="rounded-[16px] border border-amber-200 bg-amber-50/80 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-amber-700">Use</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">Import + proposal backup</p>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 shadow-sm">
              {projectFiles.length === 0 ? (
                <div className="px-6 py-9 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <Paperclip className="h-6 w-6" />
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-slate-900">No project files yet</h4>
                  <p className="mt-2 text-sm text-slate-500">Upload takeoff sheets, reference drawings, scope docs, or proposal support material to keep the estimate self-contained.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {projectFiles.map((file) => (
                    <div key={file.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50/70">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="truncate">{file.fileName}</span>
                        </div>
                        <div className="mt-2 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3">
                          <span>Type: {file.mimeType}</span>
                          <span>Size: {formatKilobytesSafe(file.sizeBytes)}</span>
                          <span>Uploaded: {new Date(file.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={api.getV1ProjectFileDownloadUrl(project.id, file.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                        <button
                          onClick={() => void removeProjectFile(file.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 text-[10px] font-semibold text-red-700 shadow-sm hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'proposal' && (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_60%,#eef4ff_100%)] p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Proposal Studio</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Client proposal synced to the live estimate</h3>
                  <p className="mt-1 text-[12px] leading-5 text-slate-600">Edit wording, generate install review notes, and preview the export layout without disconnecting from estimate totals.</p>
                </div>
                <div className="flex w-full max-w-full flex-col gap-2 lg:w-auto lg:items-end">
                  <div className="flex max-w-full flex-wrap items-center gap-2 lg:justify-end">
                    <button
                      onClick={() => void generateProposalDraft('scope_summary')}
                      disabled={proposalDrafting !== null}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {proposalDrafting === 'scope_summary' ? 'Generating Scope Summary...' : 'AI Scope Summary'}
                    </button>
                    <button
                      onClick={() => void generateProposalDraft('default_short')}
                      disabled={proposalDrafting !== null}
                      className="inline-flex h-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-3 text-[10px] font-semibold text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)] hover:brightness-[1.03] disabled:opacity-50"
                    >
                      {proposalDrafting === 'default_short' ? 'Drafting Short Proposal...' : 'Use Short Proposal Default'}
                    </button>
                    <button
                      onClick={() => void generateProposalDraft('terms_and_conditions')}
                      disabled={proposalDrafting !== null}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {proposalDrafting === 'terms_and_conditions' ? 'Refreshing Terms...' : 'Refresh Terms Only'}
                    </button>
                    <button
                      onClick={() => void generateInstallReviewEmail()}
                      disabled={installReviewGenerating}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-3 text-[10px] font-semibold text-blue-700 shadow-sm hover:bg-blue-100 disabled:opacity-50"
                    >
                      {installReviewGenerating ? 'Generating Install Review...' : 'Generate Install Review Email'}
                    </button>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-2 lg:justify-end">
                    <button
                      onClick={() => void saveProposalWording()}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                    >
                      Save Proposal Edits
                    </button>
                    <button
                      onClick={() => resetProposalDefaults('all')}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      Reset To Defaults
                    </button>
                    <button onClick={() => void printProposalDocument()} className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Print</button>
                    <button onClick={exportProposal} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--brand)_0%,#164fa8_100%)] px-3 text-[10px] font-semibold text-white shadow-[0_12px_28px_rgba(11,61,145,0.22)] hover:brightness-[1.03]"><Download className="h-3.5 w-3.5" />Export PDF</button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-white/90 p-3 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Proposal Value</p>
                  <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(currentProposalSummary?.baseBidTotal)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Live estimate total</p>
                </div>
                <div className="rounded-[18px] bg-[var(--brand-soft)] p-3 shadow-sm ring-1 ring-blue-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-800">Grouped Products</p>
                  <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{proposalGroupedItemCount}</p>
                  <p className="mt-1 text-[11px] text-slate-600">Grouped from current estimate lines.</p>
                </div>
                <div className="rounded-[18px] bg-amber-50/80 p-3 shadow-sm ring-1 ring-amber-200/80">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">Sync State</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">Proposal preview follows the live estimate</p>
                  <p className="mt-1 text-[11px] text-slate-600">Export and print use the same preview layout shown below.</p>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] items-start">
              <section className="space-y-4">
                <CrewRecommendationCard crew={summary?.crewRecommendation} manualInstallerCount={jobConditions.installerCount} />
                <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-3.5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Internal Install Review</p>
                      <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Estimator to install handoff email</h4>
                      <p className="mt-1 text-[12px] text-slate-500">Generate an internal install review email from the live estimate, current project conditions, and grouped scope summary.</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <button
                        onClick={() => void generateInstallReviewEmail()}
                        disabled={installReviewGenerating}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        {installReviewGenerating ? 'Refreshing...' : installReviewDraft ? 'Regenerate' : 'Generate'}
                      </button>
                      <button
                        onClick={() => void copyInstallReviewEmailBody()}
                        disabled={!installReviewDraft}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3.5 text-[11px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Copy Email
                      </button>
                    </div>
                  </div>
                  {installReviewDraft ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-[18px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Subject</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{installReviewDraft.subject}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[18px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Crew</p>
                          <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{installReviewDraft.summary.crewSize ?? 'TBD'}</p>
                        </div>
                        <div className="rounded-[18px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Work Weeks</p>
                          <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(installReviewDraft.summary.estimatedWeeks || 0, 1)}</p>
                        </div>
                        <div className="rounded-[18px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Days On Site</p>
                          <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(installReviewDraft.summary.estimatedDays || 0, 0)}</p>
                        </div>
                      </div>
                      <textarea
                        readOnly
                        rows={20}
                        className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700 outline-none"
                        value={installReviewDraft.body}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                      Generate the internal install review email after scope and project conditions are set.
                    </div>
                  )}
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-3.5 shadow-sm">
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Editable Proposal Copy</p>
                    <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Edit only the blocks that need custom wording</h4>
                  </div>

                  <div className="space-y-3">
                    <label className="block rounded-[18px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Scope Summary / Intro</span>
                        <button type="button" onClick={() => resetProposalDefaults('intro')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={6}
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalIntro || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalIntro: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[18px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Terms</span>
                        <button type="button" onClick={() => resetProposalDefaults('terms')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalTerms || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalTerms: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[18px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Exclusions</span>
                        <button type="button" onClick={() => resetProposalDefaults('exclusions')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalExclusions || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalExclusions: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[18px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Clarifications</span>
                        <button type="button" onClick={() => resetProposalDefaults('clarifications')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <textarea
                        rows={5}
                        className="mt-2 w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalClarifications || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalClarifications: e.target.value })}
                      />
                    </label>

                    <label className="block rounded-[18px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Acceptance Label</span>
                        <button type="button" onClick={() => resetProposalDefaults('acceptance')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Reset Default</button>
                      </span>
                      <input
                        className="mt-2 h-9 w-full rounded-[14px] border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={settings?.proposalAcceptanceLabel || ''}
                        onChange={(e) => settings && setSettings({ ...settings, proposalAcceptanceLabel: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </section>

              <div className="space-y-4">
                <section className="rounded-[20px] border border-slate-200/80 bg-white/90 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Live Preview</p>
                      <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Client-ready proposal rendering</h4>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-600">Print/export uses this layout</span>
                  </div>
                </section>

                <ProposalPreview
                  project={project}
                  settings={settings}
                  website={companyWebsite}
                  lines={lines}
                  summary={currentProposalSummary}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <ItemPicker
        open={catalogOpen}
        rooms={rooms}
        bundles={bundles}
        activeRoomId={activeRoomId}
        categories={categories}
        search={catalogSearch}
        category={catalogCategory}
        items={filteredCatalog}
        onClose={() => setCatalogOpen(false)}
        onSearch={setCatalogSearch}
        onCategory={setCatalogCategory}
        onAddItems={addDraftItems}
        onApplyBundle={applyBundle}
      />

      <BundlePickerModal
        open={bundleModalOpen}
        bundles={bundles}
        rooms={rooms}
        activeRoomId={activeRoomId}
        onClose={() => setBundleModalOpen(false)}
        onApplyBundle={applyBundle}
      />

      {modifiersModalOpen && selectedLine && (
        <div className="fixed inset-0 z-50 bg-[radial-gradient(circle_at_top,rgba(10,34,77,0.18)_0%,rgba(15,23,42,0.55)_60%)] p-3 backdrop-blur-sm sm:p-6" onClick={() => setModifiersModalOpen(false)}>
          <div className="mx-auto flex h-[90vh] max-w-5xl flex-col overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_32px_80px_rgba(15,23,42,0.22)]" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,248,251,0.96)_100%)] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-chip-soft">Line editor</span>
                    <span className="ui-chip-soft">{selectedLine.category || 'Uncategorized'}</span>
                    <span className="ui-chip-soft">{roomNamesById[selectedLine.roomId] || 'Unassigned room'}</span>
                  </div>
                  <h3 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">Edit line item</h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">Adjust description, room placement, pricing, notes, and modifiers without losing sight of the line’s sell math.</p>
                </div>
                <button onClick={() => setModifiersModalOpen(false)} className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">Done</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatNumberSafe(selectedLine.qty, 0)}</p></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Material</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencySafe(selectedLine.materialCost)}</p></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Labor</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatCurrencySafe(selectedLine.laborCost)}</p></div>
                <div className="rounded-2xl bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-3 text-white shadow-[0_18px_40px_rgba(10,34,77,0.18)]"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300">Unit Sell</p><p className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">{formatCurrencySafe(selectedLine.unitSell)}</p></div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0 overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Line details</p>
                      <p className="mt-1 text-[11px] text-slate-500">Set the identity, room, and descriptive information that appears in the estimate grid.</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Description
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.description} onChange={(e) => patchLineLocal(selectedLine.id, { description: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Room
                          <select className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.roomId} onChange={(e) => patchLineLocal(selectedLine.id, { roomId: e.target.value })} onBlur={() => void persistLine(selectedLine.id)}>
                      {rooms.map((room) => <option key={room.id} value={room.id}>{room.roomName}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Category
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.category || ''} onChange={(e) => patchLineLocal(selectedLine.id, { category: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Qty
                          <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.qty} onChange={(e) => patchLineLocal(selectedLine.id, { qty: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700">Unit
                          <input className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.unit} onChange={(e) => patchLineLocal(selectedLine.id, { unit: e.target.value })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                        <label className="text-[11px] font-medium text-slate-700 md:col-span-2">Notes
                          <textarea rows={4} className="ui-textarea mt-1 rounded-2xl" value={selectedLine.notes || ''} onChange={(e) => patchLineLocal(selectedLine.id, { notes: e.target.value || null })} onBlur={() => void persistLine(selectedLine.id)} />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Pricing</p>
                      <p className="mt-1 text-[11px] text-slate-500">Base line math before overall estimate markups. Edits update the grid immediately.</p>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {showMaterial ? (
                          <label className="text-[11px] font-medium text-slate-700">Material
                            <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.materialCost} onChange={(e) => patchLineLocal(selectedLine.id, { materialCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                          </label>
                        ) : null}
                        {showLabor ? (
                          <label className="text-[11px] font-medium text-slate-700">Labor
                            <input type="number" className="ui-input mt-1 h-10 rounded-xl" value={selectedLine.laborCost} onChange={(e) => patchLineLocal(selectedLine.id, { laborCost: Number(e.target.value) || 0 })} onBlur={() => void persistLine(selectedLine.id)} />
                            {(summary?.conditionLaborMultiplier || 1) !== 1 ? <p className="mt-1 text-[10px] text-slate-500">Effective labor with project multiplier: {formatCurrencySafe((selectedLine.laborCost || 0) * (summary?.conditionLaborMultiplier || 1))}</p> : null}
                          </label>
                        ) : null}
                        <label className="text-[11px] font-medium text-slate-700">Unit Sell
                          <div className="mt-1 space-y-2">
                            <input type="number" className="ui-input h-10 rounded-xl" value={selectedLine.unitSell} onChange={(e) => patchLineLocal(selectedLine.id, { unitSell: Number(e.target.value) || 0, pricingSource: 'manual' })} onBlur={() => void persistLine(selectedLine.id)} />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                              <span>
                                {selectedLine.pricingSource === 'manual'
                                  ? 'Manual override preserved during repricing.'
                                  : `Calculated from material + labor: ${formatCurrencySafe(selectedLine.materialCost + selectedLine.laborCost)}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => void resetLineToCalculatedPrice(selectedLine.id)}
                                disabled={selectedLine.pricingSource !== 'manual'}
                                className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Reset To Calculated
                              </button>
                            </div>
                          </div>
                        </label>
                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200/80">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Base minutes</p>
                          <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-slate-950">{formatNumberSafe(selectedLine.laborMinutes, 1)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8ff_100%)] p-4 shadow-sm ring-1 ring-slate-200/80">
                      <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900">Line snapshot</p>
                      <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Room</span><span className="font-semibold text-slate-900">{roomNamesById[selectedLine.roomId] || 'Unassigned'}</span></div>
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Category</span><span className="font-semibold text-slate-900">{selectedLine.category || 'Uncategorized'}</span></div>
                        <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80"><span>Line total</span><span className="font-semibold text-slate-900">{formatCurrencySafe(selectedLine.lineTotal)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.98)_100%)] p-4 lg:border-l lg:border-t-0">
                <ModifierPanel
                  modifiers={modifiers}
                  activeModifiers={lineModifiers}
                  selectedLinePresent={!!selectedLine}
                  onApplyModifier={(modifierId) => void applyModifier(modifierId)}
                  onRemoveModifier={(lineModifierId) => void removeModifier(lineModifierId)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {takeoffRoomsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 p-3 sm:p-6" onClick={() => setTakeoffRoomsModalOpen(false)}>
          <div
            className="mx-auto h-[88vh] max-w-4xl rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Manage Rooms</h2>
                <p className="text-sm text-slate-500">Keep room setup out of the main takeoff grid, then add or organize rooms with enough space to work comfortably.</p>
              </div>
              <button
                onClick={() => setTakeoffRoomsModalOpen(false)}
                className="h-8 px-3 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 p-5 bg-slate-50/70">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Workspace Rooms</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Room Library</h3>
                <p className="mt-1 text-sm text-slate-600">Pick a room to focus the grids, duplicate a similar room, or create a new one with a starter line item.</p>
                <div className="mt-4 min-h-0">
                  <RoomManager
                    rooms={rooms}
                    activeRoomId={activeRoomId}
                    onSelectRoom={setActiveRoomId}
                    onOpenCreateRoom={openCreateRoomModal}
                    onRenameRoom={(room) => void renameRoom(room)}
                    onDuplicateRoom={(room) => void duplicateRoom(room)}
                    onDeleteRoom={(room) => void deleteRoom(room)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Selected Room</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{roomNamesById[activeRoomId] || 'No room selected'}</h3>
                  <p className="mt-1 text-sm text-slate-600">Use rooms for spaces, phases, alternates, or any grouping that keeps imported and priced scope readable.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Rooms</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{rooms.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Active Lines</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{activeRoomLines.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Room Total</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrencySafe(roomSubtotal)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
                  <p className="text-sm font-medium text-slate-900">New room flow</p>
                  <p className="mt-1 text-sm text-slate-600">Add Room now opens a proper dialog that asks for the room name and whether you want to auto add a starter line item immediately.</p>
                  <button onClick={openCreateRoomModal} className="mt-3 ui-btn-secondary h-9 px-3 text-[11px] font-semibold">Open Add Room</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {roomCreateModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/45 p-3 sm:p-6" onClick={closeCreateRoomModal}>
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">Add Room</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Create a New Room or Area</h2>
              <p className="mt-1 text-sm text-slate-600">Name the room first, then choose whether to start it with a line item right away.</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block text-[11px] font-medium text-slate-700">
                Room Name
                <input
                  autoFocus
                  className="ui-input mt-1 h-10"
                  value={roomCreationDraft.roomName}
                  onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, roomName: e.target.value }))}
                  placeholder="Restroom A, Lobby, Exterior Entry, Phase 2..."
                />
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={roomCreationDraft.addStarterLine}
                    onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, addStarterLine: e.target.checked }))}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">Auto add a starter item</span>
                    <span className="block text-slate-500">Turn this on when you want the new room to open with a first manual line already in place.</span>
                  </span>
                </label>

                {roomCreationDraft.addStarterLine ? (
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_100px_90px] gap-3">
                    <label className="text-[11px] font-medium text-slate-700">
                      Item Description
                      <input
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterDescription}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterDescription: e.target.value }))}
                        placeholder="Grab bar, mirror, partition panel..."
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Qty
                      <input
                        type="number"
                        min={1}
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterQty}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterQty: Number(e.target.value) || 1 }))}
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Unit
                      <input
                        className="ui-input mt-1 h-10"
                        value={roomCreationDraft.starterUnit}
                        onChange={(e) => setRoomCreationDraft((prev) => ({ ...prev, starterUnit: e.target.value.toUpperCase() || 'EA' }))}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={closeCreateRoomModal} disabled={creatingRoom} className="h-9 px-3 rounded-md border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={() => void createRoom()} disabled={creatingRoom || !roomCreationDraft.roomName.trim()} className="h-9 px-4 rounded-md bg-blue-700 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {creatingRoom ? 'Creating...' : roomCreationDraft.addStarterLine ? 'Create Room + Item' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
