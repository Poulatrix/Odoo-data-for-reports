import React, { useState } from 'react';
import { 
  X, 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Search, 
  Layers,
  Sparkles,
  AlertCircle,
  Star
} from 'lucide-react';
import { TimesheetWorkgroup } from '../../types/odoo';

interface TimesheetWorkgroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  workgroups: TimesheetWorkgroup[];
  onSaveWorkgroups: (groups: TimesheetWorkgroup[]) => void;
  availableEmployees: { id: number; name: string; departmentName?: string; jobTitle?: string }[];
  activeWorkgroupId: string | null;
  onSelectWorkgroup: (id: string | null) => void;
  favoriteWorkgroupId?: string | null;
  onSetFavoriteWorkgroup?: (id: string | null) => void;
}

export const TimesheetWorkgroupModal: React.FC<TimesheetWorkgroupModalProps> = ({
  isOpen,
  onClose,
  workgroups,
  onSaveWorkgroups,
  availableEmployees,
  activeWorkgroupId,
  onSelectWorkgroup,
  favoriteWorkgroupId,
  onSetFavoriteWorkgroup
}) => {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>('');
  const [groupDescription, setGroupDescription] = useState<string>('');
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Start creating a new group
  const handleStartCreate = () => {
    setEditingGroupId('new');
    setGroupName('');
    setGroupDescription('');
    setSelectedEmpIds([]);
    setErrorMessage(null);
  };

  // Start editing existing group
  const handleStartEdit = (group: TimesheetWorkgroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setSelectedEmpIds([...group.employeeIds]);
    setErrorMessage(null);
  };

  // Save current group (create or edit)
  const handleSaveCurrentGroup = () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setErrorMessage('Le nom du groupe de travail est obligatoire.');
      return;
    }

    if (selectedEmpIds.length === 0) {
      setErrorMessage('Veuillez sélectionner au moins un collaborateur.');
      return;
    }

    let updatedGroups: TimesheetWorkgroup[] = [];
    const now = new Date().toISOString();

    if (editingGroupId === 'new') {
      const newGroup: TimesheetWorkgroup = {
        id: `wg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        description: groupDescription.trim(),
        employeeIds: selectedEmpIds,
        createdAt: now,
        updatedAt: now
      };
      updatedGroups = [...workgroups, newGroup];
      // Automatically select newly created group
      onSelectWorkgroup(newGroup.id);
    } else {
      updatedGroups = workgroups.map(g => {
        if (g.id === editingGroupId) {
          return {
            ...g,
            name: trimmedName,
            description: groupDescription.trim(),
            employeeIds: selectedEmpIds,
            updatedAt: now
          };
        }
        return g;
      });
    }

    onSaveWorkgroups(updatedGroups);
    setEditingGroupId(null);
    setErrorMessage(null);
  };

  // Delete group
  const handleDeleteGroup = (groupId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const groupToDelete = workgroups.find(g => g.id === groupId);
    const updated = workgroups.filter(g => g.id !== groupId);
    onSaveWorkgroups(updated);
    if (activeWorkgroupId === groupId) {
      onSelectWorkgroup(null);
    }
    if (editingGroupId === groupId) {
      setEditingGroupId(null);
    }
    setErrorMessage(null);
  };

  // Toggle employee in selection
  const handleToggleEmployee = (id: number) => {
    if (selectedEmpIds.includes(id)) {
      setSelectedEmpIds(selectedEmpIds.filter(eId => eId !== id));
    } else {
      setSelectedEmpIds([...selectedEmpIds, id]);
    }
  };

  // Select all filtered employees
  const handleSelectAllFiltered = (filteredList: typeof availableEmployees) => {
    const ids = filteredList.map(e => e.id);
    const combined = Array.from(new Set([...selectedEmpIds, ...ids]));
    setSelectedEmpIds(combined);
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedEmpIds([]);
  };

  const filteredEmployees = availableEmployees.filter(emp => 
    emp.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (emp.departmentName && emp.departmentName.toLowerCase().includes(searchFilter.toLowerCase())) ||
    (emp.jobTitle && emp.jobTitle.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Gestion des Groupes de Travail
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Créez des équipes d'employés (Atelier Injection, Usinage, Mécanique) pour filtrer rapidement le suivi
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          
          {editingGroupId ? (
            /* Editing / Creating Form */
            <div className="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-purple-700 dark:text-purple-300">
                  {editingGroupId === 'new' ? '➕ Créer un nouveau Groupe de Travail' : '✏️ Modifier le Groupe de Travail'}
                </h4>
                <button
                  onClick={() => setEditingGroupId(null)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Annuler
                </button>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Group Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nom du Groupe * (ex: Atelier Injection, Usinage, Mécanique)
                </label>
                <input
                  type="text"
                  placeholder="ex: Atelier Injection"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Description / Remarques (facultatif)
                </label>
                <input
                  type="text"
                  placeholder="ex: Équipe injection thermoplastique & régleurs"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Employee Selection */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span>Membres du groupe ({selectedEmpIds.length} sélectionnés)</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSelectAllFiltered(filteredEmployees)}
                      className="text-[11px] font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                    >
                      Tout cocher
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      onClick={handleDeselectAll}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>

                {/* Employee Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrer les collaborateurs..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                {/* Employee Checkbox List */}
                <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  {filteredEmployees.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      Aucun collaborateur trouvé
                    </p>
                  ) : (
                    filteredEmployees.map(emp => {
                      const isChecked = selectedEmpIds.includes(emp.id);
                      return (
                        <div
                          key={emp.id}
                          onClick={() => handleToggleEmployee(emp.id)}
                          className={`flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors ${
                            isChecked 
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium' 
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="w-4 h-4 rounded text-slate-900 border-slate-300 focus:ring-slate-400"
                            />
                            <span>{emp.name}</span>
                          </div>
                          {emp.jobTitle && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              {emp.jobTitle}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/60">
                {editingGroupId !== 'new' ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(editingGroupId)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ce groupe</span>
                  </button>
                ) : <div />}

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setEditingGroupId(null)}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveCurrentGroup}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Enregistrer le groupe</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Workgroups List */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Groupes existants ({workgroups.length})
                </span>
                <button
                  onClick={handleStartCreate}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nouveau Groupe</span>
                </button>
              </div>

              {workgroups.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                  <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Aucun groupe de travail créé pour le moment.
                  </p>
                  <button
                    onClick={handleStartCreate}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer shadow-xs"
                  >
                    Créer un premier groupe (ex: Atelier Injection)
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {workgroups.map(group => {
                    const isSelected = activeWorkgroupId === group.id;
                    return (
                      <div
                        key={group.id}
                        className={`p-3.5 rounded-lg border transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div 
                          className="space-y-1 cursor-pointer flex-1"
                          onClick={() => onSelectWorkgroup(isSelected ? null : group.id)}
                        >
                          <div className="flex items-center space-x-2.5">
                            <span className="font-semibold text-xs text-slate-900 dark:text-white">
                              {group.name}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {group.employeeIds.length} collaborateur(s)
                            </span>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                Actif
                              </span>
                            )}
                            {favoriteWorkgroupId === group.id && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center gap-1 border border-amber-200 dark:border-amber-800">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                                Favori par défaut
                              </span>
                            )}
                          </div>
                          {group.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                              {group.description}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 ml-4">
                          {onSetFavoriteWorkgroup && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetFavoriteWorkgroup(group.id);
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                favoriteWorkgroupId === group.id
                                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800'
                                  : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              title={
                                favoriteWorkgroupId === group.id
                                  ? 'Groupe favori actif au démarrage (cliquez pour retirer)'
                                  : 'Définir ce groupe comme vue favorite au démarrage'
                              }
                            >
                              <Star className={`w-3.5 h-3.5 ${favoriteWorkgroupId === group.id ? 'fill-amber-400 text-amber-500' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => handleStartEdit(group)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Modifier ce groupe"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteGroup(group.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Supprimer ce groupe"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
