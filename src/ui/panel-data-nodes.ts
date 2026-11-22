



















import type { tick } from "@/ui/chart-ticks";
import type { HotForceImage } from "@/ui/heatmap";










export interface PanelChart {

  value: string;

  unit: string;

  label: string;

  caption: string;







  points: number[];







  xTicks: tick[];




  yTicks: tick[];
}


export interface PanelShareStat {

  k: string;

  v: string;

  small: string;
}











export interface PanelShare {

  title: string;

  subtitle: string;

  date: string;

  label: string;

  value: string;

  unit: string;

  points: number[];

  xTicks: tick[];










  xMinor: number;











  shape: "curve" | "heat";






  heat: HotForceImage | null;

  less: string;
  more: string;

  stats: PanelShareStat[];

  foot: string;

  file: string;
}








export interface PanelHeatmap {

  title: string;

  unit: string;






  grid: HotForceImage;
}










export type PanelCardIcon = "round" | "today" | "long" | "doc" | "record";


export interface PanelCard {

  icon: PanelCardIcon;

  value: string;

  unit: string;

  caption: string;







  points: number[];
}


export interface PanelCardsTotal {

  label: string;

  value: string;

  unit: string;
}







export interface PanelCards {

  title: string;

  items: PanelCard[];

  total: PanelCardsTotal | null;
}
