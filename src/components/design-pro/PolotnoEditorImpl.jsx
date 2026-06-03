// ============================================================
// PolotnoEditorImpl.jsx — Implementacion real de Polotno
// ============================================================
// Componente cargado con React.lazy desde CanvaEditor.
// Importa todo el CSS + JS de Polotno aqui para que Vite los
// empaquete en chunks lazy (solo se descargan al abrir editor).
// ============================================================
import React from 'react';

// CSS requerido por Polotno (Blueprint.js + iconos)
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';

// Componentes Polotno
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Workspace } from 'polotno/canvas/workspace';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { SidePanel } from 'polotno/side-panel';
import { PagesTimeline } from 'polotno/pages-timeline';

export { createStore } from 'polotno/model/store';

export default function PolotnoEditorImpl({ store }) {
    return (
        <PolotnoContainer style={{ width: '100%', height: '100%' }}>
            <SidePanelWrap>
                <SidePanel store={store} />
            </SidePanelWrap>
            <WorkspaceWrap>
                <Toolbar store={store} downloadButtonEnabled={false} />
                <Workspace store={store} />
                <ZoomButtons store={store} />
                <PagesTimeline store={store} />
            </WorkspaceWrap>
        </PolotnoContainer>
    );
}
