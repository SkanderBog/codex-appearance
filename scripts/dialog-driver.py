#!/usr/bin/env python3
"""Exercise only the explicitly named dialogs created by dialog-smoke.cjs."""
import sys, time
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi
wanted = sys.argv[1]
title_wanted = sys.argv[2]
def walk(node, depth=0):
    if depth > 50:
        return
    node.clear_cache()
    yield node
    for i in range(min(node.get_child_count(), 120)):
        try:
            yield from walk(node.get_child_at_index(i), depth + 1)
        except Exception:
            continue
seen = set()
end = time.monotonic() + 45
while time.monotonic() < end:
    desktop = Atspi.get_desktop(0)
    for app in [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]:
        try:
            windows = [app.get_child_at_index(i) for i in range(app.get_child_count())]
            for win in windows:
                title=win.get_name()
                if ('zenity' in app.get_name().lower() or 'Appearance' in title) and title not in seen:
                    seen.add(title)
                    print('Native test picker title:', repr(title), 'role:', win.get_role_name(), flush=True)
                if win.get_name() != title_wanted:
                    continue
                nodes=list(walk(win))
                if wanted == 'Open':
                    for node in nodes:
                        if node.get_name() == 'background.png. File':
                            parent=node.get_parent()
                            selection=parent.get_selection_iface()
                            if selection:
                                print('Selected test image:',selection.select_child(node.get_index_in_parent()),flush=True)
                for node in nodes:
                    if node.get_role_name() in ('push button', 'button') and node.get_name().replace('_', '') in (wanted, 'OK'):
                        node.clear_cache()
                        iface=node.get_action_iface()
                        if iface and iface.get_n_actions() and node.get_state_set().contains(Atspi.StateType.SENSITIVE):
                            iface.do_action(0)
                            print('Activated',wanted,'in the test dialog.',flush=True)
                            sys.exit(0)
        except Exception:
            continue
    time.sleep(.25)
print('No matching test dialog button was accessible.')
sys.exit(1)
