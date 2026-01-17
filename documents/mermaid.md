sequenceDiagram
    autonumber
    participant BD as Braille Display
    participant BB as BrailleBridge (local)
    participant RL as Renderer+Mapping (BB)
    participant L as Liblouis (BB)
    participant API as BB HTTP/WS API
    participant BS as BrailleServer (Activity UI)
    participant UI as Browser UI (Activity page)

    rect rgb(245,245,245)
    note over BB,RL: Editor Mode ON => BrailleBridge owns buffer + cursor
    end

    %% — Enable editor mode from Activity UI —
    UI->>BS: User opens activity requiring input
    BS->>API: WS/HTTP: editor.enable {table, initialText, cursor}
    API->>BB: Enable editor mode + init EditorState
    BB->>RL: Render(initialText, cursor, table)
    RL->>L: forwardTranslate(text->braille) + build mappings
    L—>>RL: unicodeBrailleLine + mapping(textIndex<->cellIndex)
    RL—>>BB: RenderResult {cells, cursorCellIndex, maps}
    BB->>BD: sendText(unicodeBrailleLine) + setCursor(cursorCellIndex)
    BB->>API: emit editor.state {text,cursorTextIndex,cursorCellIndex,line}
    API—>>BS: editor.state event
    BS—>>UI: Update onscreen monitor (optional)

    %% — Typing on braille display (dots) —
    BD->>BB: RawKeyEvent (dots mask, key up/down, special keys)
    BB->>BB: Normalize event => BrailleInputEvent
    alt Dot chord committed
        BB->>L: backTranslate(brailleCell->ink) using table
        L—>>BB: insertedText (e.g., “a”)
        BB->>BB: EditorEngine.InsertText(insertedText)
    else Backspace/Delete/Navigation key
        BB->>BB: EditorEngine.Backspace/Delete/MoveLeft/MoveRight/Home/End
    end
    BB->>RL: Render(EditorState.Text, CursorTextIndex, table)
    RL->>L: forwardTranslate(text->braille) + build mappings
    L—>>RL: unicodeBrailleLine + mapping arrays
    RL—>>BB: RenderResult {cells, cursorCellIndex, maps}
    BB->>BD: sendText(unicodeBrailleLine) + setCursor(cursorCellIndex)
    BB->>API: emit editor.state (after each mutation)
    API—>>BS: editor.state event
    BS—>>UI: Update UI state (text preview, cursor)

    %% — Routing key press (cell -> text index) —
    BD->>BB: RoutingKey(cellIndex N)
    BB->>RL: Lookup textIndex = CellToTextIndex[N]
    RL—>>BB: textIndex
    BB->>BB: EditorEngine.SetCursor(textIndex)
    BB->>RL: Render(...) to update cursor cell
    RL—>>BB: cursorCellIndex
    BB->>BD: setCursor(cursorCellIndex)
    BB->>API: emit editor.state (cursor changed)
    API—>>BS: editor.state event

    %% — Server-side commands during editor mode —
    UI->>BS: User presses onscreen button (e.g., clear, insert template)
    BS->>API: editor.command {op, args} / editor.setText
    API->>BB: Apply command to EditorEngine
    BB->>RL: Render(...) + update BD
    BB->>API: emit editor.state
    API—>>BS: editor.state event
    BS—>>UI: Update UI

    %% — Commit/submit (activity evaluates answer) —
    BD->>BB: Enter/Confirm key (or UI submit)
    BB->>API: emit editor.commit {text}
    API—>>BS: editor.commit event
    BS->>BS: Activity checks answer / updates score
    BS—>>UI: Feedback + next step
    BS->>API: (optional) editor.disable OR editor.setText(newPrompt)