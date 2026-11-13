// Iconos de la interfaz (D77). Único punto de entrada a lucide-react (ESLint lo exige): los iconos son
// decorativos por defecto —`aria-hidden` y `focusable=false`— porque el texto o el `aria-label` del control
// que los contiene ya dicen lo que hacen. lucide-react 0.378 no lo hace por sí mismo y sin esto Chromium
// expone cada <svg> como una imagen sin nombre. Un icono que transmite información por sí solo se marca
// pasando `aria-label` (o `title`), y entonces se anuncia como imagen con ese nombre.
import { createElement, forwardRef } from 'react';
// eslint-disable-next-line no-restricted-imports
import * as L from 'lucide-react';

export function decorative(Icon) {
  const Wrapped = forwardRef(function DecorativeIcon(props, ref) {
    const named = Boolean(props['aria-label'] || props['aria-labelledby'] || props.title);
    return createElement(Icon, { ...(named ? { role: 'img' } : { 'aria-hidden': true }), focusable: 'false', ...props, ref });
  });
  Wrapped.displayName = Icon.displayName;
  return Wrapped;
}

export const AlertCircle = decorative(L.AlertCircle);
export const AlertTriangle = decorative(L.AlertTriangle);
export const ArrowDown = decorative(L.ArrowDown);
export const ArrowLeft = decorative(L.ArrowLeft);
export const ArrowRight = decorative(L.ArrowRight);
export const ArrowUp = decorative(L.ArrowUp);
export const BarChart3 = decorative(L.BarChart3);
export const Bell = decorative(L.Bell);
export const Bookmark = decorative(L.Bookmark);
export const Boxes = decorative(L.Boxes);
export const Building = decorative(L.Building);
export const Check = decorative(L.Check);
export const CheckCircle = decorative(L.CheckCircle);
export const CheckCircle2 = decorative(L.CheckCircle2);
export const ChevronDown = decorative(L.ChevronDown);
export const ChevronLeft = decorative(L.ChevronLeft);
export const ChevronRight = decorative(L.ChevronRight);
export const ChevronUp = decorative(L.ChevronUp);
export const ClipboardList = decorative(L.ClipboardList);
export const Clock = decorative(L.Clock);
export const CreditCard = decorative(L.CreditCard);
export const DollarSign = decorative(L.DollarSign);
export const Download = decorative(L.Download);
export const Edit = decorative(L.Edit);
export const ExternalLink = decorative(L.ExternalLink);
export const Eye = decorative(L.Eye);
export const Facebook = decorative(L.Facebook);
export const FileText = decorative(L.FileText);
export const Filter = decorative(L.Filter);
export const FolderKanban = decorative(L.FolderKanban);
export const FolderOpen = decorative(L.FolderOpen);
export const Grid = decorative(L.Grid);
export const Headphones = decorative(L.Headphones);
export const Heart = decorative(L.Heart);
export const HelpCircle = decorative(L.HelpCircle);
export const Home = decorative(L.Home);
export const Image = decorative(L.Image);
export const Info = decorative(L.Info);
export const Instagram = decorative(L.Instagram);
export const KeyRound = decorative(L.KeyRound);
export const LayoutDashboard = decorative(L.LayoutDashboard);
export const Lock = decorative(L.Lock);
export const LogOut = decorative(L.LogOut);
export const Mail = decorative(L.Mail);
export const MapPin = decorative(L.MapPin);
export const Menu = decorative(L.Menu);
export const MessageCircle = decorative(L.MessageCircle);
export const Minus = decorative(L.Minus);
export const Package = decorative(L.Package);
export const PackageCheck = decorative(L.PackageCheck);
export const Pencil = decorative(L.Pencil);
export const Phone = decorative(L.Phone);
export const Plus = decorative(L.Plus);
export const Printer = decorative(L.Printer);
export const RefreshCw = decorative(L.RefreshCw);
export const RotateCcw = decorative(L.RotateCcw);
export const Ruler = decorative(L.Ruler);
export const Save = decorative(L.Save);
export const Search = decorative(L.Search);
export const Settings = decorative(L.Settings);
export const ShieldAlert = decorative(L.ShieldAlert);
export const ShieldCheck = decorative(L.ShieldCheck);
export const ShoppingBag = decorative(L.ShoppingBag);
export const SlidersHorizontal = decorative(L.SlidersHorizontal);
export const Sparkles = decorative(L.Sparkles);
export const Star = decorative(L.Star);
export const Store = decorative(L.Store);
export const Tag = decorative(L.Tag);
export const Trash2 = decorative(L.Trash2);
export const Truck = decorative(L.Truck);
export const Upload = decorative(L.Upload);
export const User = decorative(L.User);
export const Users = decorative(L.Users);
export const Wifi = decorative(L.Wifi);
export const WifiOff = decorative(L.WifiOff);
export const X = decorative(L.X);
export const XCircle = decorative(L.XCircle);
export const ZoomIn = decorative(L.ZoomIn);
