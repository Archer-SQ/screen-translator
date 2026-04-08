#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) {
            fprintf(stderr, "Usage: ocr-macos <image-path>\n");
            return 1;
        }

        NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
        NSImage *image = [[NSImage alloc] initWithContentsOfFile:imagePath];
        if (!image) {
            fprintf(stderr, "Failed to load image: %s\n", argv[1]);
            return 1;
        }

        CGImageRef cgImage = [image CGImageForProposedRect:nil context:nil hints:nil];
        if (!cgImage) {
            fprintf(stderr, "Failed to get CGImage\n");
            return 1;
        }

        size_t origW = CGImageGetWidth(cgImage);
        size_t origH = CGImageGetHeight(cgImage);

        // === Upscale 2x for better small text recognition ===
        CGFloat scale = 2.0;
        size_t newW = (size_t)(origW * scale);
        size_t newH = (size_t)(origH * scale);
        CGColorSpaceRef colorSpace = CGImageGetColorSpace(cgImage);
        CGBitmapInfo bitmapInfo = CGImageGetBitmapInfo(cgImage);
        CGContextRef ctx = CGBitmapContextCreate(NULL, newW, newH,
            CGImageGetBitsPerComponent(cgImage), 0, colorSpace, bitmapInfo);
        if (!ctx) {
            // Fallback: try standard RGBA if original bitmap info fails
            ctx = CGBitmapContextCreate(NULL, newW, newH, 8, 0, colorSpace,
                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
        }
        if (!ctx) {
            fprintf(stderr, "Failed to create upscale context, using original size\n");
            scale = 1.0;
            newW = origW;
            newH = origH;
        }

        CGImageRef ocrImage = cgImage;
        if (ctx) {
            CGContextSetInterpolationQuality(ctx, kCGInterpolationHigh);
            CGContextDrawImage(ctx, CGRectMake(0, 0, newW, newH), cgImage);
            CGImageRef scaled = CGBitmapContextCreateImage(ctx);
            CGContextRelease(ctx);
            if (scaled) {
                ocrImage = scaled;
            } else {
                scale = 1.0;
                newW = origW;
                newH = origH;
            }
        }

        CGFloat imageWidth = newW;
        CGFloat imageHeight = newH;

        // === Configure OCR request ===
        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;

        // Use Revision 3 (macOS 13+) for best accuracy
        if (@available(macOS 13, *)) {
            request.revision = VNRecognizeTextRequestRevision3;
            request.automaticallyDetectsLanguage = YES;
        }

        // CJK first — Vision prioritizes by order
        request.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"ja", @"ko",
                                          @"en", @"fr", @"de", @"es", @"pt", @"it"];
        request.usesLanguageCorrection = YES;

        // Detect all text sizes including very small text
        request.minimumTextHeight = 0.0;

        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:ocrImage options:@{}];
        NSError *error = nil;
        [handler performRequests:@[request] error:&error];

        if (error) {
            fprintf(stderr, "OCR failed: %s\n", [[error localizedDescription] UTF8String]);
            if (ocrImage != cgImage) CGImageRelease(ocrImage);
            return 1;
        }

        NSArray<VNRecognizedTextObservation *> *observations = request.results;
        if (!observations || observations.count == 0) {
            printf("[]\n");
            if (ocrImage != cgImage) CGImageRelease(ocrImage);
            return 0;
        }

        NSMutableArray *results = [NSMutableArray array];

        for (VNRecognizedTextObservation *obs in observations) {
            VNRecognizedText *candidate = [[obs topCandidates:1] firstObject];
            if (!candidate) continue;

            // Skip very low confidence results (garbled text)
            if (candidate.confidence < 0.2) continue;

            CGRect box = obs.boundingBox;
            // Vision: origin = bottom-left, normalized [0,1]
            // Convert to: origin = top-left, pixel coordinates in ORIGINAL image
            double x = box.origin.x * imageWidth / scale;
            double y = (1.0 - box.origin.y - box.size.height) * imageHeight / scale;
            double w = box.size.width * imageWidth / scale;
            double h = box.size.height * imageHeight / scale;

            [results addObject:@{
                @"text": candidate.string,
                @"confidence": @(candidate.confidence),
                @"x": @(round(x)),
                @"y": @(round(y)),
                @"width": @(round(w)),
                @"height": @(round(h))
            }];
        }

        if (ocrImage != cgImage) CGImageRelease(ocrImage);

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        printf("%s\n", [jsonString UTF8String]);

        return 0;
    }
}
