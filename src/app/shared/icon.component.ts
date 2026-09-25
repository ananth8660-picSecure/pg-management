import { Component, Input } from '@angular/core';
@Component({selector:'app-icon',standalone:true,template:`<svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="paths[name] || paths['grid']"/></svg>`,styles:[`:host{display:inline-grid;place-items:center;width:20px;height:20px}svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}`]})
export class IconComponent{
 @Input() name='grid';
 paths:Record<string,string>={
  grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  home:'M3 11 12 4l9 7v9h-6v-6H9v6H3z',
  building:'M4 21V5l8-3v19M12 8h8v13M7 8h2M7 12h2M7 16h2M15 11h2M15 15h2M15 19h2M2 21h20',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  badge:'M12 2 15 5h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4zM9 12l2 2 4-4',
  bed:'M3 20v-8M21 20v-8M3 16h18M7 12V8h5a4 4 0 0 1 4 4M3 12h4V9H3z',
  wallet:'M4 7h15a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v3M16 12h5',
  wrench:'M14.7 6.3a4 4 0 0 1-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-3 3-3-3z',
  archive:'M3 6h18M5 6v15h14V6M9 10h6M4 3h16v3H4z',
  utensils:'M6 2v8M3 2v5a3 3 0 0 0 6 0V2M6 10v12M16 2v20M16 2c3 3 4 7 0 10',
  zap:'m13 2-9 12h7l-1 8 9-12h-7z',
  receipt:'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  cart:'M3 4h2l2 11h10l2-8H6M9 20h.01M17 20h.01',
  calendar:'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  folder:'M3 6h7l2 2h9v11H3z',
  history:'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  sliders:'M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4M14 4v4M7 10v4M12 16v4',
  search:'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16M21 21l-4.3-4.3',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  plus:'M12 5v14M5 12h14',chevron:'m9 18 6-6-6-6',
  file:'M6 2h8l4 4v16H6zM14 2v6h6',clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  menu:'M4 6h16M4 12h16M4 18h16',
  settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.5 1A8 8 0 0 0 15 6l-.4-2.7h-4L10 6a8 8 0 0 0-1.5 1L6 6l-2 3.5L6 11a7 7 0 0 0 0 2l-2 1.5L6 18l2.5-1a8 8 0 0 0 1.5 1l.5 2.7h4L15 18a8 8 0 0 0 1.5-1l2.5 1 2-3.5-2-1.5a7 7 0 0 0 0-1z',
  shield:'M12 2 20 5v6c0 5.2-3.3 9-8 11-4.7-2-8-5.8-8-11V5zM9 12l2 2 4-5',
  lock:'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2',
  logout:'M10 17l5-5-5-5M15 12H3M14 3h7v18h-7'
 };
}
