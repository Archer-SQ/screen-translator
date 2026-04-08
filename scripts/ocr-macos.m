#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) { fprintf(stderr, "Usage: ocr-macos <image-path>\n"); return 1; }

        NSString *imagePath = [NSString stringWithUTF8String:argv[1]];
        NSImage *image = [[NSImage alloc] initWithContentsOfFile:imagePath];
        if (!image) { fprintf(stderr, "Failed to load image\n"); return 1; }

        CGImageRef cgImage = [image CGImageForProposedRect:nil context:nil hints:nil];
        if (!cgImage) { fprintf(stderr, "Failed to get CGImage\n"); return 1; }

        size_t origW = CGImageGetWidth(cgImage);
        size_t origH = CGImageGetHeight(cgImage);

        // 2x upscale for better small text detection
        CGFloat scale = 2.0;
        size_t newW = (size_t)(origW * scale);
        size_t newH = (size_t)(origH * scale);
        CGColorSpaceRef cs = CGImageGetColorSpace(cgImage);
        CGContextRef ctx = CGBitmapContextCreate(NULL, newW, newH, 8, 0, cs,
            kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);

        CGImageRef ocrImage = cgImage;
        if (ctx) {
            CGContextSetInterpolationQuality(ctx, kCGInterpolationHigh);
            CGContextDrawImage(ctx, CGRectMake(0, 0, newW, newH), cgImage);
            CGImageRef scaled = CGBitmapContextCreateImage(ctx);
            CGContextRelease(ctx);
            if (scaled) ocrImage = scaled; else scale = 1.0;
        } else { scale = 1.0; }

        CGFloat imgW = CGImageGetWidth(ocrImage);
        CGFloat imgH = CGImageGetHeight(ocrImage);

        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        if (@available(macOS 13, *)) {
            request.revision = VNRecognizeTextRequestRevision3;
            request.automaticallyDetectsLanguage = YES;
        }
        request.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"ja", @"ko",
                                          @"en", @"fr", @"de", @"es", @"pt", @"it"];
        request.usesLanguageCorrection = YES;
        request.minimumTextHeight = 0.0;

        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:ocrImage options:@{}];
        NSError *error = nil;
        [handler performRequests:@[request] error:&error];
        if (error) {
            if (ocrImage != cgImage) CGImageRelease(ocrImage);
            fprintf(stderr, "OCR failed: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }

        NSMutableArray *results = [NSMutableArray array];
        for (VNRecognizedTextObservation *obs in request.results) {
            VNRecognizedText *candidate = [[obs topCandidates:1] firstObject];
            if (!candidate || candidate.confidence < 0.2) continue;

            CGRect box = obs.boundingBox;
            double x = box.origin.x * imgW / scale;
            double y = (1.0 - box.origin.y - box.size.height) * imgH / scale;
            double w = box.size.width * imgW / scale;
            double h = box.size.height * imgH / scale;

            [results addObject:@{
                @"text": candidate.string,
                @"confidence": @(candidate.confidence),
                @"x": @(round(x)), @"y": @(round(y)),
                @"width": @(round(w)), @"height": @(round(h))
            }];
        }

        if (ocrImage != cgImage) CGImageRelease(ocrImage);

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        printf("%s\n", [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding].UTF8String);
        return 0;
    }
}
