import { ToolButton } from './primitives';

interface Props {
  onImportJSON: () => void;
  onExportJPEG: () => void;
  onExportJSON: () => void;
  onExportHTML: () => void;
  onExportPNGs: () => void;
  hasSelection: boolean;
}

export function ExportSection({ onImportJSON, onExportJPEG, onExportJSON, onExportHTML, onExportPNGs, hasSelection }: Props) {
  return (
    <div className="toolbar-section toolbar-right">
      <ToolButton onClick={onImportJSON} title="Import ICP JSON" className="export-btn">
        Import
      </ToolButton>
      <ToolButton onClick={onExportJPEG} title="Export JPEG" className="export-btn">
        JPEG
      </ToolButton>
      <ToolButton onClick={onExportJSON} title="Export ICP JSON" className="export-btn">
        JSON
      </ToolButton>
      <ToolButton onClick={onExportHTML} title="Export HTML" className="export-btn">
        HTML
      </ToolButton>
      {hasSelection && (
        <ToolButton onClick={onExportPNGs} title="Export Selected as PNG" className="export-btn">
          PNGs
        </ToolButton>
      )}
    </div>
  );
}
