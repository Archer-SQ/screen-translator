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

        CGFloat imageWidth = CGImageGetWidth(cgImage);
        CGFloat imageHeight = CGImageGetHeight(cgImage);

        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        // CJK first — Vision prioritizes by order; en first misreads Chinese as Latin
        request.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"ja", @"ko",
                                          @"en", @"fr", @"de", @"es", @"pt", @"it", @"ru"];
        request.usesLanguageCorrection = YES;

        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
        NSError *error = nil;
        [handler performRequests:@[request] error:&error];

        if (error) {
            fprintf(stderr, "OCR failed: %s\n", [[error localizedDescription] UTF8String]);
            return 1;
        }

        NSArray<VNRecognizedTextObservation *> *observations = request.results;
        if (!observations || observations.count == 0) {
            printf("[]\n");
            return 0;
        }

        NSMutableArray *results = [NSMutableArray array];

        for (VNRecognizedTextObservation *obs in observations) {
            VNRecognizedText *candidate = [[obs topCandidates:1] firstObject];
            if (!candidate) continue;

            CGRect box = obs.boundingBox;
            // Vision: origin = bottom-left, normalized [0,1]
            // Convert to: origin = top-left, pixel coordinates
            double x = box.origin.x * imageWidth;
            double y = (1.0 - box.origin.y - box.size.height) * imageHeight;
            double w = box.size.width * imageWidth;
            double h = box.size.height * imageHeight;

            [results addObject:@{
                @"text": candidate.string,
                @"confidence": @(candidate.confidence),
                @"x": @(round(x)),
                @"y": @(round(y)),
                @"width": @(round(w)),
                @"height": @(round(h))
            }];
        }

        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:results options:0 error:nil];
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        printf("%s\n", [jsonString UTF8String]);

        return 0;
    }
}
