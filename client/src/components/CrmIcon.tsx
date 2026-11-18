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
