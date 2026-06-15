export interface Workbook {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sheet {
  id: string;
  workbookId: string;
  name: string;
  position: number;
  nRows: number;
  nCols: number;
}

export interface Cell {
  id: string;
  sheetId: string;
  row: number;
  col: number;
  raw: string | null;
  value: string | null;
  dtype: string;
}

export interface CellPatch {
  row: number;
  col: number;
  raw: string | null;
  value: string | null;
  dtype?: string;
}
