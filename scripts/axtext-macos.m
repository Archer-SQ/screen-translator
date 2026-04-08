#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static NSMutableArray *results;
static NSSet *textRoles;

void collectText(AXUIElementRef element, int depth) {
    if (depth > 50) return; // Chrome AX trees can be very deep

    CFTypeRef roleRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute, &roleRef);
    if (!roleRef) return;

    NSString *role = (__bridge NSString *)roleRef;
    BOOL isTextRole = [textRoles containsObject:role];

    if (isTextRole) {
        NSString *text = nil;

        // Try value first (static text, text fields)
        CFTypeRef valueRef = NULL;
        AXUIElementCopyAttributeValue(element, kAXValueAttribute, &valueRef);
        if (valueRef && CFGetTypeID(valueRef) == CFStringGetTypeID()) {
            text = (__bridge NSString *)valueRef;
            CFRelease(valueRef);
        }

        // Fallback: title (buttons, menu items)
        if (!text || text.length == 0) {
            CFTypeRef titleRef = NULL;
            AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &titleRef);
            if (titleRef && CFGetTypeID(titleRef) == CFStringGetTypeID()) {
                text = (__bridge NSString *)titleRef;
                CFRelease(titleRef);
            }
        }

        // Fallback: description (some elements use this)
        if (!text || text.length == 0) {
            CFTypeRef descRef = NULL;
            AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute, &descRef);
            if (descRef && CFGetTypeID(descRef) == CFStringGetTypeID()) {
                text = (__bridge NSString *)descRef;
                CFRelease(descRef);
            }
        }

        if (text && text.length > 1) {
            CFTypeRef posRef = NULL, sizeRef = NULL;
            AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &posRef);
            AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &sizeRef);

            if (posRef && sizeRef) {
                CGPoint pos; CGSize size;
                AXValueGetValue(posRef, kAXValueCGPointType, &pos);
                AXValueGetValue(sizeRef, kAXValueCGSizeType, &size);

                if (size.width > 8 && size.height > 8 &&
                    size.width < 800 && size.height < 200 &&
                    pos.x >= 0 && pos.y >= 0) {
                    [results addObject:@{
                        @"text": text,
                        @"x": @(pos.x), @"y": @(pos.y),
                        @"width": @(size.width), @"height": @(size.height),
                        @"role": role, @"confidence": @(1.0)
                    }];
                }
            }
            if (posRef) CFRelease(posRef);
            if (sizeRef) CFRelease(sizeRef);
        }
    }

    CFRelease(roleRef);

    // Recurse into children
    CFTypeRef childrenRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &childrenRef);
    if (childrenRef) {
        NSArray *children = (__bridge NSArray *)childrenRef;
        for (id child in children) {
            collectText((__bridge AXUIElementRef)child, depth + 1);
        }
        CFRelease(childrenRef);
    }
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        textRoles = [NSSet setWithArray:@[
            (NSString *)kAXStaticTextRole,
            (NSString *)kAXTextFieldRole,
            (NSString *)kAXTextAreaRole,
            (NSString *)kAXButtonRole,
            (NSString *)kAXMenuItemRole,
            (NSString *)kAXMenuButtonRole,
            @"AXLink", @"AXHeading", @"AXCell",
            @"AXMenuItem", @"AXTab",
        ]];

        pid_t targetPid = 0;
        if (argc >= 2) {
            targetPid = atoi(argv[1]); // PID passed from Electron
        }
        if (targetPid == 0) {
            NSRunningApplication *frontApp = NSWorkspace.sharedWorkspace.frontmostApplication;
            if (!frontApp) { printf("[]\n"); return 0; }
            targetPid = frontApp.processIdentifier;
        }
        fprintf(stderr, "[ax] Target PID: %d\n", targetPid);

        AXUIElementRef app = AXUIElementCreateApplication(targetPid);
        results = [NSMutableArray array];

        // Set a timeout to prevent hanging on complex AX trees
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
            collectText(app, 0);
            dispatch_semaphore_signal(sem);
        });
        dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));

        CFRelease(app);

        NSData *json = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        printf("%s\n", [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        return 0;
    }
}
