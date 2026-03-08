"""
OptiRoute Pro Setup Tool — Desktop setup utility for OptiRoute Pro project.

Provides a minimal tkinter GUI that:
  1. Shows a "Set Up Server" button on the main screen.
  2. Transitions to a Server Details Form (API Key, Endpoint) in the same window.
  3. Opens a directory selection dialog.
  4. Copies the bundled Node.js + Express server into the selected directory.
  5. Safely appends user-provided environment variables to the server's .env file.

Path resolution:
  - When running from source: resources are at  <project_root>/resources/
  - When running as PyInstaller exe: resources are at  <exe_dir>/resources/
    (because --add-data bundles them relative to the exe, and the simulated
     install directory places a copy of resources/ beside the exe).
"""

import os
import sys
import shutil
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def get_app_root() -> str:
    """Return the application root directory.

    • Frozen (PyInstaller --onefile): Uses the TEMP extraction dir (_MEIPASS)
      for bundled data, but we prefer the *exe's own directory* so that
      the simulated-install layout (resources/ beside the exe) works.
    • Development: Two levels up from src/main.py → project root.
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled exe — resources sit next to the exe
        return os.path.dirname(sys.executable)
    else:
        # Running from source — project root is parent of src/
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_resource_path(*parts) -> str:
    """Build an absolute path under <app_root>/resources/."""
    return os.path.join(get_app_root(), 'resources', *parts)


def get_bundled_resource_path(*parts) -> str:
    """Build an absolute path for resources bundled inside PyInstaller exe.

    When running as a --onefile exe, PyInstaller extracts --add-data files
    into a temp dir (sys._MEIPASS). We check there first, then fall back to
    the exe-relative path.
    """
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        meipass_path = os.path.join(sys._MEIPASS, 'resources', *parts)
        if os.path.exists(meipass_path):
            return meipass_path
    return get_resource_path(*parts)


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def check_node_installed() -> bool:
    """Return True if Node.js is available on the system PATH."""
    try:
        result = subprocess.run(
            ['node', '-v'],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

def copy_server(destination_dir: str) -> str:
    """Copy the bundled server folder to *destination_dir*/server.

    Returns the path of the created server folder.
    Raises FileNotFoundError if bundled server is missing.
    Raises FileExistsError  if target already exists.
    """
    server_src = get_bundled_resource_path('server')

    if not os.path.isdir(server_src):
        raise FileNotFoundError(
            f'Bundled server folder not found at:\n{server_src}'
        )

    server_dest = os.path.join(destination_dir, 'server')

    if os.path.exists(server_dest):
        raise FileExistsError(
            f'A "server" folder already exists at:\n{server_dest}\n\n'
            'Please choose a different location or remove the existing folder.'
        )

    shutil.copytree(server_src, server_dest)
    return server_dest


def update_env_file(server_dir: str, env_vars: dict) -> None:
    """Safely append environment variables to the .env file in *server_dir*.

    Rules:
      - If .env exists, read it and only append keys that are NOT already
        defined (regardless of their current value).
      - If .env does not exist, create it with the provided variables.
      - Empty string values are valid (e.g. ``EXAMPLE_API_KEY=``).
    """
    env_path = os.path.join(server_dir, '.env')

    # Parse existing keys (if any)
    existing_keys: set = set()
    existing_content = ''
    if os.path.isfile(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            existing_content = f.read()
        for line in existing_content.splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith('#') and '=' in stripped:
                key = stripped.split('=', 1)[0].strip()
                existing_keys.add(key)

    # Build lines to append
    new_lines: list = []
    for key, value in env_vars.items():
        if key not in existing_keys:
            new_lines.append(f'{key}={value}')

    if not new_lines:
        return  # nothing to add

    # Ensure existing content ends with a newline before appending
    if existing_content and not existing_content.endswith('\n'):
        existing_content += '\n'

    with open(env_path, 'w', encoding='utf-8') as f:
        f.write(existing_content + '\n'.join(new_lines) + '\n')


# ---------------------------------------------------------------------------
# UI constants
# ---------------------------------------------------------------------------

WINDOW_WIDTH = 500
WINDOW_HEIGHT = 440
BG_COLOR = '#1e1e2e'
BTN_COLOR = '#7c3aed'
BTN_HOVER = '#6d28d9'
BTN_SECONDARY = '#3f3f46'
BTN_SECONDARY_HOVER = '#52525b'
BTN_TEXT = '#ffffff'
LABEL_COLOR = '#a1a1aa'
TITLE_COLOR = '#e4e4e7'
ENTRY_BG = '#2a2a3c'
ENTRY_FG = '#e4e4e7'
ENTRY_BORDER = '#3f3f46'


def center_window(root: tk.Tk, w: int, h: int) -> None:
    """Center *root* on the screen."""
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    root.geometry(f'{w}x{h}+{x}+{y}')


def _add_hover(btn: tk.Button, normal: str, hover: str) -> None:
    """Bind enter/leave hover color swap to *btn*."""
    btn.bind('<Enter>', lambda e: btn.config(bg=hover))
    btn.bind('<Leave>', lambda e: btn.config(bg=normal))


# ---------------------------------------------------------------------------
# UI – views
# ---------------------------------------------------------------------------

def create_ui() -> None:
    root = tk.Tk()
    root.title('Setup Tool')
    root.configure(bg=BG_COLOR)
    root.resizable(False, False)
    center_window(root, WINDOW_WIDTH, WINDOW_HEIGHT)

    # Container frame that holds the current "view"
    container = tk.Frame(root, bg=BG_COLOR)
    container.pack(fill='both', expand=True)

    # ------------------------------------------------------------------ #
    #  Shared status label (persists across views)                       #
    # ------------------------------------------------------------------ #
    status_var = tk.StringVar(value='')

    # ------------------------------------------------------------------ #
    #  Helper: clear the container                                        #
    # ------------------------------------------------------------------ #
    def clear_container():
        for widget in container.winfo_children():
            widget.destroy()

    # ================================================================== #
    #  VIEW 1 — Main screen  (single "Set Up Server" button)             #
    # ================================================================== #
    def show_main_view():
        clear_container()
        status_var.set('')

        tk.Label(
            container, text='OptiRoute Pro Setup Tool',
            font=('Segoe UI', 18, 'bold'), fg=TITLE_COLOR, bg=BG_COLOR,
        ).pack(pady=(60, 5))

        tk.Label(
            container, text='Install the Node.js server to your machine',
            font=('Segoe UI', 10), fg=LABEL_COLOR, bg=BG_COLOR,
        ).pack(pady=(0, 35))

        btn = tk.Button(
            container, text='Set Up Server',
            font=('Segoe UI', 13, 'bold'),
            fg=BTN_TEXT, bg=BTN_COLOR,
            activebackground=BTN_HOVER, activeforeground=BTN_TEXT,
            relief='flat', cursor='hand2', padx=30, pady=10,
            command=show_form_view,
        )
        btn.pack()
        _add_hover(btn, BTN_COLOR, BTN_HOVER)

        # Status feedback
        tk.Label(
            container, textvariable=status_var,
            font=('Segoe UI', 9), fg=LABEL_COLOR, bg=BG_COLOR,
            wraplength=400, justify='center',
        ).pack(pady=(25, 0))

    # ================================================================== #
    #  VIEW 2 — Server Details Form                                      #
    # ================================================================== #
    def show_form_view():
        clear_container()

        tk.Label(
            container, text='Server Details',
            font=('Segoe UI', 16, 'bold'), fg=TITLE_COLOR, bg=BG_COLOR,
        ).pack(pady=(30, 5))

        tk.Label(
            container, text='Enter environment variables for the server (optional)',
            font=('Segoe UI', 9), fg=LABEL_COLOR, bg=BG_COLOR,
        ).pack(pady=(0, 20))

        # --- Form fields ---
        form_frame = tk.Frame(container, bg=BG_COLOR)
        form_frame.pack(padx=60, fill='x')

        # EXAMPLE_API_KEY
        tk.Label(
            form_frame, text='EXAMPLE_API_KEY',
            font=('Segoe UI', 10), fg=LABEL_COLOR, bg=BG_COLOR, anchor='w',
        ).pack(fill='x', pady=(0, 3))

        api_key_var = tk.StringVar()
        api_key_entry = tk.Entry(
            form_frame, textvariable=api_key_var,
            font=('Segoe UI', 11), bg=ENTRY_BG, fg=ENTRY_FG,
            insertbackground=ENTRY_FG, relief='flat',
            highlightthickness=1, highlightbackground=ENTRY_BORDER,
            highlightcolor=BTN_COLOR,
        )
        api_key_entry.pack(fill='x', ipady=6, pady=(0, 15))

        # EXAMPLE_ENDPOINT
        tk.Label(
            form_frame, text='EXAMPLE_ENDPOINT',
            font=('Segoe UI', 10), fg=LABEL_COLOR, bg=BG_COLOR, anchor='w',
        ).pack(fill='x', pady=(0, 3))

        endpoint_var = tk.StringVar()
        endpoint_entry = tk.Entry(
            form_frame, textvariable=endpoint_var,
            font=('Segoe UI', 11), bg=ENTRY_BG, fg=ENTRY_FG,
            insertbackground=ENTRY_FG, relief='flat',
            highlightthickness=1, highlightbackground=ENTRY_BORDER,
            highlightcolor=BTN_COLOR,
        )
        endpoint_entry.pack(fill='x', ipady=6, pady=(0, 15))

        # MONGODB_URI
        tk.Label(
            form_frame, text='MONGODB_URI',
            font=('Segoe UI', 10), fg=LABEL_COLOR, bg=BG_COLOR, anchor='w',
        ).pack(fill='x', pady=(0, 3))

        mongo_uri_var = tk.StringVar()
        mongo_uri_entry = tk.Entry(
            form_frame, textvariable=mongo_uri_var,
            font=('Segoe UI', 11), bg=ENTRY_BG, fg=ENTRY_FG,
            insertbackground=ENTRY_FG, relief='flat',
            highlightthickness=1, highlightbackground=ENTRY_BORDER,
            highlightcolor=BTN_COLOR,
        )
        mongo_uri_entry.pack(fill='x', ipady=6, pady=(0, 25))

        # --- Buttons (Back / Continue) ---
        btn_frame = tk.Frame(container, bg=BG_COLOR)
        btn_frame.pack(pady=(5, 0))

        back_btn = tk.Button(
            btn_frame, text='Back',
            font=('Segoe UI', 11), fg=BTN_TEXT, bg=BTN_SECONDARY,
            activebackground=BTN_SECONDARY_HOVER, activeforeground=BTN_TEXT,
            relief='flat', cursor='hand2', padx=20, pady=7,
            command=show_main_view,
        )
        back_btn.pack(side='left', padx=(0, 12))
        _add_hover(back_btn, BTN_SECONDARY, BTN_SECONDARY_HOVER)

        continue_btn = tk.Button(
            btn_frame, text='Continue',
            font=('Segoe UI', 11, 'bold'), fg=BTN_TEXT, bg=BTN_COLOR,
            activebackground=BTN_HOVER, activeforeground=BTN_TEXT,
            relief='flat', cursor='hand2', padx=20, pady=7,
            command=lambda: on_continue(
                api_key_var.get(), 
                endpoint_var.get(),
                mongo_uri_var.get()
            ),
        )
        continue_btn.pack(side='left')
        _add_hover(continue_btn, BTN_COLOR, BTN_HOVER)

    # ------------------------------------------------------------------ #
    #  Continue handler — directory selection + copy + .env               #
    # ------------------------------------------------------------------ #
    def on_continue(api_key: str, endpoint: str, mongo_uri: str):
        directory = filedialog.askdirectory(title='Select Installation Directory')
        if not directory:
            return  # user cancelled the dialog

        try:
            server_path = copy_server(directory)

            # Write .env
            env_vars = {
                'EXAMPLE_API_KEY': api_key,
                'EXAMPLE_ENDPOINT': endpoint,
                'MONGODB_URI': mongo_uri,
            }
            update_env_file(server_path, env_vars)

            show_main_view()
            status_var.set(f'✓ Server installed to:\n{server_path}')
            messagebox.showinfo('Success', f'Server folder created at:\n{server_path}')

            # Warn if Node.js is not found (non-blocking)
            if not check_node_installed():
                messagebox.showwarning(
                    'Node.js Not Found',
                    'Node.js was not detected on this system.\n\n'
                    'To run the server locally, install Node.js from:\n'
                    'https://nodejs.org\n\n'
                    'If you are deploying to a cloud service (Vercel, etc.), '
                    'you can ignore this warning.'
                )

        except FileExistsError as exc:
            show_main_view()
            status_var.set('⚠ Setup cancelled — folder already exists.')
            messagebox.showwarning('Already Exists', str(exc))
        except FileNotFoundError as exc:
            show_main_view()
            status_var.set('✗ Error — bundled server not found.')
            messagebox.showerror('Error', str(exc))
        except Exception as exc:
            show_main_view()
            status_var.set('✗ Unexpected error.')
            messagebox.showerror('Error', f'An unexpected error occurred:\n{exc}')

    # Start with the main view
    show_main_view()
    root.mainloop()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    create_ui()
