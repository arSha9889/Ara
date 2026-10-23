use std::sync::atomic::{AtomicBool, Ordering};

use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSGlassEffectView, NSGlassEffectViewStyle, NSTextAlignment,
    NSTextField, NSView, NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility,
};
use objc2_foundation::{NSPoint, NSProcessInfo, NSRect, NSSize, NSString};

const TITLEBAR_HEIGHT: f64 = 42.0;
const MINIMUM_LIQUID_GLASS_MAJOR_VERSION: isize = 26;

static IS_INSTALLED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy)]
struct WindowCapabilities {
    closable: bool,
    minimizable: bool,
    resizable: bool,
}

pub async fn initialize(window: tauri::WebviewWindow) -> Result<bool, String> {
    if IS_INSTALLED.load(Ordering::Acquire) {
        return Ok(true);
    }

    let capabilities = WindowCapabilities {
        closable: window
            .is_closable()
            .map_err(|error| format!("Could not inspect the native window: {error}"))?,
        minimizable: window
            .is_minimizable()
            .map_err(|error| format!("Could not inspect the native window: {error}"))?,
        resizable: window
            .is_resizable()
            .map_err(|error| format!("Could not inspect the native window: {error}"))?,
    };
    let window_for_main_thread = window.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();

    window
        .run_on_main_thread(move || {
            let _ = sender.send(install(&window_for_main_thread, capabilities));
        })
        .map_err(|error| format!("Could not access the native window: {error}"))?;

    receiver
        .await
        .map_err(|_| "The native window became unavailable".to_owned())?
}

fn install(
    window: &tauri::WebviewWindow,
    capabilities: WindowCapabilities,
) -> Result<bool, String> {
    let main_thread = MainThreadMarker::new()
        .ok_or_else(|| "Liquid Glass must be initialized on the main thread".to_owned())?;

    if NSProcessInfo::processInfo()
        .operatingSystemVersion()
        .majorVersion
        < MINIMUM_LIQUID_GLASS_MAJOR_VERSION
    {
        return Ok(false);
    }

    if IS_INSTALLED.load(Ordering::Acquire) {
        return Ok(true);
    }

    let native_window = native_window(window)?;
    configure_native_titlebar(native_window, capabilities);

    // Updating the style mask from an undecorated Tauri window to a titled
    // full-size-content window can rebuild AppKit's content hierarchy. Add the
    // overlay only after that transition so it remains the topmost subview.
    let root_view = native_window
        .contentView()
        .ok_or_else(|| "The native window has no content view".to_owned())?;
    let titlebar_frame = titlebar_frame(root_view.bounds());

    let glass = NSGlassEffectView::initWithFrame(main_thread.alloc(), titlebar_frame);
    glass.setStyle(NSGlassEffectViewStyle::Regular);
    glass.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );

    let glass_content = NSView::initWithFrame(
        main_thread.alloc(),
        NSRect::new(NSPoint::new(0.0, 0.0), titlebar_frame.size),
    );
    glass_content.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    glass.setContentView(Some(&glass_content));
    add_title_label(&glass_content, main_thread);

    root_view.addSubview(&glass);
    IS_INSTALLED.store(true, Ordering::Release);

    Ok(true)
}

fn native_window(window: &tauri::WebviewWindow) -> Result<&NSWindow, String> {
    let pointer = window
        .ns_window()
        .map_err(|error| format!("Could not get the native window: {error}"))?;

    if pointer.is_null() {
        return Err("The native window is unavailable".to_owned());
    }

    // Tauri owns this NSWindow for the lifetime of the webview window. The caller is on AppKit's
    // main thread, which is required for all AppKit view access.
    Ok(unsafe { &*(pointer.cast::<NSWindow>()) })
}

fn titlebar_frame(bounds: NSRect) -> NSRect {
    let height = bounds.size.height.min(TITLEBAR_HEIGHT);

    NSRect::new(
        NSPoint::new(
            bounds.origin.x,
            bounds.origin.y + bounds.size.height - height,
        ),
        NSSize::new(bounds.size.width, height),
    )
}

fn add_title_label(content_view: &NSView, main_thread: MainThreadMarker) {
    let title = NSString::from_str("AraChat");
    let label = NSTextField::labelWithString(&title, main_thread);
    let width = 160.0;
    let height = 18.0;
    let bounds = content_view.bounds();

    label.setFrame(NSRect::new(
        NSPoint::new(
            (bounds.size.width - width) / 2.0,
            (bounds.size.height - height) / 2.0,
        ),
        NSSize::new(width, height),
    ));
    label.setAlignment(NSTextAlignment::Center);
    label.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewMinXMargin
            | NSAutoresizingMaskOptions::ViewMaxXMargin
            | NSAutoresizingMaskOptions::ViewMinYMargin
            | NSAutoresizingMaskOptions::ViewMaxYMargin,
    );
    content_view.addSubview(&label);
}

fn configure_native_titlebar(window: &NSWindow, capabilities: WindowCapabilities) {
    let mut style = NSWindowStyleMask::Titled | NSWindowStyleMask::FullSizeContentView;
    if capabilities.closable {
        style |= NSWindowStyleMask::Closable;
    }
    if capabilities.minimizable {
        style |= NSWindowStyleMask::Miniaturizable;
    }
    if capabilities.resizable {
        style |= NSWindowStyleMask::Resizable;
    }

    window.setStyleMask(style);
    window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
    window.setTitlebarAppearsTransparent(true);
    window.setMovableByWindowBackground(true);

    for button in [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ] {
        if let Some(button) = window.standardWindowButton(button) {
            button.setHidden(false);
        }
    }
}
