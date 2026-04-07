#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static NSMutableArray *results;

// Only collect these roles — small text-bearing elements
static NSSet *allowedRoles;

void collectTextElements(AXUIElementRef element, int depth) {
    if (depth > 20) return;

    CFTypeRef roleRef = NULL;
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute, &roleRef);
    if (!roleRef) return;

    NSString *role = (__bridge NSString *)roleRef;

    // Only process text-bearing element types
    BOOL isTextRole = [allowedRoles containsObject:role];

    if (isTextRole) {
        NSString *text = nil;

        // Get value (for static text, text fields)
        CFTypeRef valueRef = NULL;
        AXUIElementCopyAttributeValue(element, kAXValueAttribute, &valueRef);
        if (valueRef && CFGetTypeID(valueRef) == CFStringGetTypeID()) {
            text = (__bridge NSString *)valueRef;
            CFRelease(valueRef);
        }

        // Fallback to title (for buttons, menu items)
        if (!text || text.length == 0) {
            CFTypeRef titleRef = NULL;
            AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &titleRef);
            if (titleRef && CFGetTypeID(titleRef) == CFStringGetTypeID()) {
                text = (__bridge NSString *)titleRef;
                CFRelease(titleRef);
            }
        }

        if (text && text.length > 1) {
            CFTypeRef posRef = NULL, sizeRef = NULL;
            AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &posRef);
            AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &sizeRef);

            if (posRef && sizeRef) {
                CGPoint pos;
                CGSize size;
                AXValueGetValue(posRef, kAXValueCGPointType, &pos);
                AXValueGetValue(sizeRef, kAXValueCGSizeType, &size);

                // Filter: only small text elements (not windows/containers)
                if (size.width > 8 && size.height > 8 &&
                    size.width < 500 && size.height < 80 &&
                    pos.x >= 0 && pos.y >= 0) {

                    [results addObject:@{
                        @"text": text,
                        @"x": @(pos.x),
                        @"y": @(pos.y),
                        @"width": @(size.width),
                        @"height": @(size.height),
                        @"role": role,
                        @"confidence": @(1.0)
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
            collectTextElements((__bridge AXUIElementRef)child, depth + 1);
        }
        CFRelease(childrenRef);
    }
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        allowedRoles = [NSSet setWithArray:@[
            (NSString *)kAXStaticTextRole,
            (NSString *)kAXTextFieldRole,
            (NSString *)kAXTextAreaRole,
            (NSString *)kAXButtonRole,
            (NSString *)kAXMenuItemRole,
            @"AXLink",
            @"AXHeading",
            @"AXCell",
        ]];

        NSRunningApplication *frontApp = NSWorkspace.sharedWorkspace.frontmostApplication;
        if (!frontApp) {
            printf("[]\n");
            return 0;
        }

        pid_t pid = frontApp.processIdentifier;
        AXUIElementRef appElement = AXUIElementCreateApplication(pid);

        results = [NSMutableArray array];
        collectTextElements(appElement, 0);
        CFRelease(appElement);

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        printf("%s\n", [jsonString UTF8String]);

        return 0;
    }
}
