import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Award,
  Ban,
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  GitMerge,
  Globe,
  GraduationCap,
  Headphones,
  Home,
  IndianRupee,
  Key,
  Laptop,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  Moon,
  PauseCircle,
  Phone,
  PhoneCall,
  PhoneOff,
  PlayCircle,
  Plus,
  PlusCircle,
  Receipt,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  School,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Unlock,
  Upload,
  User,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Video,
  Wallet,
  Wifi,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

export type CrmIconName =
  | 'home'
  | 'user'
  | 'user-check'
  | 'user-cog'
  | 'user-plus'
  | 'users'
  | 'file-text'
  | 'file-spreadsheet'
  | 'check-square'
  | 'message-square'
  | 'message-circle'
  | 'whatsapp'
  | 'school'
  | 'building'
  | 'lightbulb'
  | 'graduation-cap'
  | 'credit-card'
  | 'rupee'
  | 'wallet'
  | 'receipt'
  | 'activity'
  | 'bar-chart'
  | 'trending-up'
  | 'bell'
  | 'bell-off'
  | 'clipboard'
  | 'shield'
  | 'shield-check'
  | 'settings'
  | 'phone'
  | 'phone-call'
  | 'phone-off'
  | 'calendar'
  | 'calendar-clock'
  | 'calendar-days'
  | 'headphones'
  | 'logout'
  | 'search'
  | 'plus'
  | 'plus-circle'
  | 'refresh'
  | 'rotate-ccw'
  | 'check'
  | 'check-circle'
  | 'x'
  | 'x-circle'
  | 'alert'
  | 'clock'
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'key'
  | 'rocket'
  | 'zap'
  | 'trophy'
  | 'award'
  | 'star'
  | 'video'
  | 'moon'
  | 'download'
  | 'upload'
  | 'trash'
  | 'edit'
  | 'save'
  | 'archive'
  | 'laptop'
  | 'smartphone'
  | 'map-pin'
  | 'globe'
  | 'book-open'
  | 'camera'
  | 'folder'
  | 'folder-open'
  | 'git-merge'
  | 'ban'
  | 'send'
  | 'filter'
  | 'sparkles'
  | 'megaphone'
  | 'target'
  | 'mail'
  | 'menu'
  | 'wifi'
  | 'play'
  | 'pause'
  | 'chevron-down'
  | 'chevron-right';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  home: Home,
  user: User,
  'user-check': UserCheck,
  'user-cog': UserCog,
  'user-plus': UserPlus,
  users: Users,
  'file-text': FileText,
  'file-spreadsheet': FileSpreadsheet,
  'check-square': CheckSquare,
  'message-square': MessageSquare,
  'message-circle': MessageCircle,
  school: School,
  building: Building2,
  lightbulb: Lightbulb,
  'graduation-cap': GraduationCap,
  'credit-card': CreditCard,
  rupee: IndianRupee,
  wallet: Wallet,
  receipt: Receipt,
  activity: Activity,
  'bar-chart': BarChart3,
  'trending-up': TrendingUp,
  bell: Bell,
  'bell-off': BellOff,
  clipboard: ClipboardList,
  shield: Shield,
  'shield-check': ShieldCheck,
  settings: Settings,
  phone: Phone,
  'phone-call': PhoneCall,
  'phone-off': PhoneOff,
  calendar: Calendar,
  'calendar-clock': CalendarClock,
  'calendar-days': CalendarDays,
  headphones: Headphones,
  logout: LogOut,
  search: Search,
  plus: Plus,
  'plus-circle': PlusCircle,
  refresh: RefreshCw,
  'rotate-ccw': RotateCcw,
  check: Check,
  'check-circle': CheckCircle2,
  x: X,
  'x-circle': XCircle,
  alert: AlertTriangle,
  clock: Clock,
  eye: Eye,
  'eye-off': EyeOff,
  lock: Lock,
  unlock: Unlock,
  key: Key,
  rocket: Rocket,
  zap: Zap,
  trophy: Trophy,
  award: Award,
  star: Star,
  video: Video,
  moon: Moon,
  download: Download,
  upload: Upload,
  trash: Trash2,
  edit: Edit3,
  save: Save,
  archive: Archive,
  laptop: Laptop,
  smartphone: Smartphone,
  'map-pin': MapPin,
  globe: Globe,
  'book-open': BookOpen,
  camera: Camera,
  folder: Folder,
  'folder-open': FolderOpen,
  'git-merge': GitMerge,
  ban: Ban,
  send: Send,
  filter: Filter,
  sparkles: Sparkles,
  megaphone: Megaphone,
  target: Target,
  mail: Mail,
  menu: Menu,
  wifi: Wifi,
  play: PlayCircle,
  pause: PauseCircle,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
};

export function CrmIcon({
  name,
  size = 16,
  strokeWidth = 2.1,
  color,
  style,
  className,
}: {
  name: CrmIconName | string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  if (name === 'whatsapp') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
        style={{
          display: 'inline-block',
          verticalAlign: '-0.16em',
          flexShrink: 0,
          color,
          ...style,
        }}
      >
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.55-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.24 3.74.59.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
      </svg>
    );
  }
  const Comp = ICON_MAP[name] || Sparkles;
  return (
    <Comp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.16em',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export default CrmIcon;
