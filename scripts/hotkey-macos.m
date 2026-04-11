#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>
#import <AppKit/AppKit.h>

typedef struct {
    CGEventFlags modifier;
    CGKeyCode key1;
    CGKeyCode key2;
    BOOL dualKey;
} HotkeyDef;

static HotkeyDef triggerHK, dismissHK, cacheHK, regionHK;
static BOOL tKey1Down = NO, tKey2Down = NO;
static BOOL rKey1Down = NO, rKey2Down = NO;
// Two states: translating (loading%) and overlay (result shown)
static BOOL translatingMode = NO;
static BOOL overlayMode = NO;
static CFAbsoluteTime lastActionTime = 0;
static const CFTimeInterval COOLDOWN = 1.0;

static CGEventFlags parseModifier(NSString *mod) {
    if ([mod isEqualToString:@"shift"]) return kCGEventFlagMaskShift;
    if ([mod isEqualToString:@"cmd"])   return kCGEventFlagMaskCommand;
    if ([mod isEqualToString:@"alt"])   return kCGEventFlagMaskAlternate;
    if ([mod isEqualToString:@"ctrl"])  return kCGEventFlagMaskControl;
    return 0;
}

static HotkeyDef parseHotkey(NSString *str) {
    HotkeyDef hk = {0, 0, 0, NO};
    NSArray *parts = [str componentsSeparatedByString:@":"];
    if (parts.count == 1) {
        hk.key1 = (CGKeyCode)[parts[0] intValue];
    } else if (parts.count == 2) {
        hk.modifier = parseModifier(parts[0]);
        hk.key1 = (CGKeyCode)[parts[1] intValue];
    } else if (parts.count >= 3) {
        hk.modifier = parseModifier(parts[0]);
        hk.key1 = (CGKeyCode)[parts[1] intValue];
        hk.key2 = (CGKeyCode)[parts[2] intValue];
        hk.dualKey = YES;
    }
    return hk;
}

CGEventRef eventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        CGEventTapEnable(*(CFMachPortRef *)refcon, true);
        return event;
    }

    CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();

    // Mouse clicks are now handled by the overlay window itself (double-click to dismiss)

    if (type != kCGEventKeyDown && type != kCGEventKeyUp) return event;

    CGKeyCode keycode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
    CGEventFlags flags = CGEventGetFlags(event);

    if (type == kCGEventKeyDown) {
        if (keycode == triggerHK.key1) tKey1Down = YES;
        if (triggerHK.dualKey && keycode == triggerHK.key2) tKey2Down = YES;
        if (keycode == regionHK.key1) rKey1Down = YES;
        if (regionHK.dualKey && keycode == regionHK.key2) rKey2Down = YES;

        BOOL modOK = (triggerHK.modifier == 0) || ((flags & triggerHK.modifier) != 0);
        BOOL triggered = triggerHK.dualKey ? (modOK && tKey1Down && tKey2Down) : (modOK && keycode == triggerHK.key1);

        BOOL regionModOK = (regionHK.modifier == 0) || ((flags & regionHK.modifier) != 0);
        BOOL regionTriggered = regionHK.dualKey ? (regionModOK && rKey1Down && rKey2Down) : (regionModOK && keycode == regionHK.key1);

        if (regionTriggered && !translatingMode && !overlayMode) {
            rKey1Down = NO; rKey2Down = NO;
            tKey1Down = NO; tKey2Down = NO;
            if (now - lastActionTime < COOLDOWN) return event;
            printf("REGION\n"); fflush(stdout);
            lastActionTime = now;
            return event;
        }

        if (triggered) {
            tKey1Down = NO; tKey2Down = NO;
            if (now - lastActionTime < COOLDOWN) return event;
            if (overlayMode) {
                printf("DISMISS\n"); fflush(stdout);
                overlayMode = NO;
            } else if (translatingMode) {
                // Already translating → cancel
                printf("CANCEL\n"); fflush(stdout);
                translatingMode = NO;
            } else {
                printf("TRIGGERED\n"); fflush(stdout);
                translatingMode = YES;
            }
            lastActionTime = now;
            return event;
        }

        // ESC (keycode 53, hardcoded) → cancel translation in progress
        if (translatingMode && !overlayMode && keycode == 53) {
            printf("CANCEL\n"); fflush(stdout);
            translatingMode = NO; lastActionTime = now;
            tKey1Down = NO; tKey2Down = NO;
            return event;
        }

        if (overlayMode) {
            // Save cache
            BOOL cacheMod = (cacheHK.modifier == 0) || ((flags & cacheHK.modifier) != 0);
            if (cacheMod && keycode == cacheHK.key1) {
                printf("SAVE_CACHE\n"); fflush(stdout);
                // Keep overlayMode = YES — overlay stays visible after caching
                lastActionTime = now;
                tKey1Down = NO; tKey2Down = NO;
                return event;
            }

            // Dismiss overlay (configurable key)
            BOOL dismissMod = (dismissHK.modifier == 0) || ((flags & dismissHK.modifier) != 0);
            if (dismissMod && keycode == dismissHK.key1) {
                printf("DISMISS\n"); fflush(stdout);
                overlayMode = NO; lastActionTime = now;
                tKey1Down = NO; tKey2Down = NO;
            }
        }
    } else if (type == kCGEventKeyUp) {
        if (keycode == triggerHK.key1) tKey1Down = NO;
        if (triggerHK.dualKey && keycode == triggerHK.key2) tKey2Down = NO;
        if (keycode == regionHK.key1) rKey1Down = NO;
        if (regionHK.dualKey && keycode == regionHK.key2) rKey2Down = NO;
    }

    return event;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        triggerHK = (HotkeyDef){kCGEventFlagMaskShift, 6, 7, YES};
        dismissHK = (HotkeyDef){0, 53, 0, NO};
        cacheHK   = (HotkeyDef){kCGEventFlagMaskShift, 1, 0, NO};
        regionHK  = (HotkeyDef){kCGEventFlagMaskShift, 6, 8, YES}; // Shift+Z+C

        for (int i = 1; i < argc; i++) {
            NSString *arg = [NSString stringWithUTF8String:argv[i]];
            if ([arg isEqualToString:@"-t"] && i + 1 < argc)
                triggerHK = parseHotkey([NSString stringWithUTF8String:argv[++i]]);
            else if ([arg isEqualToString:@"-d"] && i + 1 < argc)
                dismissHK = parseHotkey([NSString stringWithUTF8String:argv[++i]]);
            else if ([arg isEqualToString:@"-c"] && i + 1 < argc)
                cacheHK = parseHotkey([NSString stringWithUTF8String:argv[++i]]);
            else if ([arg isEqualToString:@"-r"] && i + 1 < argc)
                regionHK = parseHotkey([NSString stringWithUTF8String:argv[++i]]);
        }

        fprintf(stderr, "Hotkeys: trigger k1=%d k2=%d, dismiss k=%d, cache k=%d, region k1=%d k2=%d\n",
                triggerHK.key1, triggerHK.key2, dismissHK.key1, cacheHK.key1,
                regionHK.key1, regionHK.key2);

        // Also need OVERLAY_SHOWN from stdin to switch translatingMode → overlayMode
        // Use a simpler approach: main process sends "SHOWN" when overlay is displayed
        // For now, use a timeout — after TRIGGERED, switch to overlayMode after receiving no CANCEL

        CGEventMask mask = CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);

        CFMachPortRef tap = CGEventTapCreate(
            kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly,
            mask, eventCallback, &tap);

        if (!tap) { fprintf(stderr, "Failed to create event tap.\n"); return 1; }

        CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);

        // Read stdin for state sync from Electron
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            char buf[64];
            while (fgets(buf, sizeof(buf), stdin)) {
                NSString *cmd = [[NSString stringWithUTF8String:buf] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
                if ([cmd isEqualToString:@"SHOWN"]) {
                    translatingMode = NO;
                    overlayMode = YES;
                } else if ([cmd isEqualToString:@"HIDDEN"]) {
                    translatingMode = NO;
                    overlayMode = NO;
                }
            }
        });

        CFRunLoopRun();
        CFRelease(source); CFRelease(tap);
    }
    return 0;
}
