import { Lock, Key, X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SMART_DEFAULTS } from '@/data/openRouterModels';
import { useBYOK } from '@/hooks/useBYOK';
import { UserRole } from '@/hooks/useUserRole';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface AvatarListProps {
  onAvatarClick: (avatarId: string) => void;
  userRole?: UserRole;
}

interface Avatar {
  id: string;
  src: string;
  name: string;
}

const DEFAULT_AVATARS: Avatar[] = [
  { id: 'chatgpt', src: '/images/avatars/chatgpt.png', name: 'ChatGPT' },
  { id: 'claude', src: '/images/avatars/claude.png', name: 'Claude' },
  { id: 'gemini', src: '/images/avatars/gemini.png', name: 'Gemini' },
  { id: 'grok', src: '/images/avatars/grok.png', name: 'Grok' },
  { id: 'llama', src: '/images/avatars/llama.png', name: 'Llama' },
  { id: 'mistral', src: '/images/avatars/mistral.png', name: 'Mistral' },
  { id: 'qwen', src: '/images/avatars/qwen.png', name: 'Qwen' },
  { id: 'phi', src: '/images/avatars/phi.png', name: 'Phi' },
  { id: 'gemma', src: '/images/avatars/gemma.png', name: 'Gemma' },
];

function SortableAvatar({
  avatar,
  state,
  sequenceNumber,
  onAvatarClick,
}: {
  avatar: Avatar;
  state: 'active' | 'silent' | 'not-selected' | 'locked';
  sequenceNumber?: number;
  onAvatarClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: avatar.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  const renderStateIcon = () => {
    switch (state) {
      case 'active':
        return <Key className="h-4 w-4 text-green-500" />;
      case 'silent':
        return <Lock className="h-4 w-4 text-orange-500" />;
      case 'not-selected':
        return <X className="h-4 w-4 text-gray-400" />;
      case 'locked':
        return <Lock className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
        state === 'active' && 'border-green-500 bg-green-50',
        state === 'silent' && 'border-orange-500 bg-orange-50',
        state === 'not-selected' && 'border-gray-300 bg-white opacity-60',
        state === 'locked' && 'border-red-300 bg-red-50 cursor-not-allowed'
      )}
    >
      {(state === 'active' || state === 'silent') && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1 left-1 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {sequenceNumber !== undefined && (
        <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
          {sequenceNumber}
        </div>
      )}

      <button onClick={onAvatarClick} disabled={state === 'locked'} className="flex flex-col items-center gap-2 focus:outline-none">
        <div className="relative">
          <img src={avatar.src} alt={avatar.name} className="w-12 h-12 rounded-full object-cover" />
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
            {renderStateIcon()}
          </div>
        </div>
        <span className="text-xs font-medium text-center">{avatar.name}</span>
      </button>
    </div>
  );
}

export const AvatarList = ({ onAvatarClick, userRole }: AvatarListProps) => {
  const {
    selectedModels,
    activeModels,
    avatarOrder,
    hasConfiguredOpenRouterKey,
    setSelectedModels,
    toggleModelActive,
    reorderAvatars,
    resetAvatarOrder,
    getModelForAvatar,
  } = useBYOK();

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const isPaidOrAdmin = userRole === 'paid' || userRole === 'admin' || userRole === 'free';
  const hasValidKey = hasConfiguredOpenRouterKey;

  const getAvatarState = (avatarId: string): 'active' | 'silent' | 'not-selected' | 'locked' => {
    if (!isPaidOrAdmin || !hasValidKey) return 'locked';
    const modelId = getModelForAvatar(avatarId);
    if (!modelId) return 'not-selected';
    const isSelected = selectedModels.includes(modelId);
    if (!isSelected) return 'not-selected';
    const isActive = activeModels.includes(modelId);
    return isActive ? 'active' : 'silent';
  };

  const handleClick = (avatarId: string) => {
    const state = getAvatarState(avatarId);
    const modelId = getModelForAvatar(avatarId);
    if (state === 'locked') {
      onAvatarClick(avatarId);
      return;
    }
    if (state === 'not-selected' && modelId) {
      setSelectedModels([...selectedModels, modelId]);
      return;
    }
    if ((state === 'active' || state === 'silent') && modelId) {
      toggleModelActive(modelId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = avatarOrder.indexOf(active.id as string);
    const newIndex = avatarOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(avatarOrder, oldIndex, newIndex);
    reorderAvatars(newOrder);
  };

  const activeAvatarIds = avatarOrder.filter((id) => getAvatarState(id) === 'active');
  const getSequenceNumber = (avatarId: string): number | undefined => {
    if (getAvatarState(avatarId) !== 'active') return undefined;
    return activeAvatarIds.indexOf(avatarId) + 1;
  };

  const orderedAvatars = avatarOrder.map((id) => DEFAULT_AVATARS.find((a) => a.id === id)!).filter(Boolean);

  return (
    <aside className="w-28 border-r flex flex-col bg-muted/30 h-screen">
      <div className="flex items-center justify-between px-2 pt-3">
        <div className="text-xs text-muted-foreground font-medium">AI Agents</div>
        {activeAvatarIds.length > 0 && (
          <button onClick={resetAvatarOrder} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
        )}
      </div>
      <div className="flex-1 p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={avatarOrder} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 gap-3">
              {orderedAvatars.map((avatar) => {
                const state = getAvatarState(avatar.id);
                const sequenceNumber = getSequenceNumber(avatar.id);
                return (
                  <SortableAvatar
                    key={avatar.id}
                    avatar={avatar}
                    state={state}
                    sequenceNumber={sequenceNumber}
                    onAvatarClick={() => handleClick(avatar.id)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {/* Custom avatars for non-default selected models */}
        {selectedModels
          .filter((modelId) => !Object.values(SMART_DEFAULTS).includes(modelId))
          .map((modelId) => {
            const isActive = activeModels.includes(modelId);
            const modelName = modelId.split('/')[1];
            return (
              <button
                key={modelId}
                onClick={() => toggleModelActive(modelId)}
                className={cn(
                  'mt-3 w-full relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                  'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
                  isActive ? 'border-green-500 bg-green-50' : 'border-orange-500 bg-orange-50'
                )}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                    {modelName[0]?.toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                    {isActive ? <Key className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-orange-500" />}
                  </div>
                </div>
                <span className="text-xs font-medium text-center">{modelName}</span>
              </button>
            );
          })}
      </div>
    </aside>
  );
};
