import { describe, expect, test, afterAll, beforeAll, beforeEach, afterEach } from "bun:test";
import { read_writer_file, write_writer_file, list_writer_files } from "../../src/tools/file-manager";
import * as fs from "node:fs/promises";
import * as nodeFs from "node:fs";
import * as path from "node:path";

describe("Writer Tools", () => {
    const testDir = path.join(process.cwd(), ".writer");
    const originalEnv = { ...process.env };

    beforeAll(async () => {
        // Ensure clean state
        await fs.rm(testDir, { recursive: true, force: true });
    });

    afterAll(async () => {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true });
    });

    afterEach(() => {
        // Restore environment variables after each test
        process.env = { ...originalEnv };
    });

    test("write_writer_file should create file", async () => {
        const result = await write_writer_file.execute({
            filename: "test.md",
            content: "# Test Content"
        }, { directory: process.cwd() } as any);
        
        expect(result).toBe("Successfully wrote to test.md");
        
        const filePath = path.join(testDir, "test.md");
        try {
            await fs.access(filePath);
            expect(true).toBe(true);
        } catch {
            expect(false).toBe(true);
        }
    });

    test("read_writer_file should read file", async () => {
        const content = await read_writer_file.execute({
            filename: "test.md"
        }, { directory: process.cwd() } as any);
        
        expect(content).toBe("# Test Content");
    });

    test("list_writer_files should list files", async () => {
        const files = await list_writer_files.execute({}, { directory: process.cwd() } as any);
        expect(files).toContain("test.md");
    });

    test("read_writer_file should return error for non-existent file", async () => {
        const result = await read_writer_file.execute({
            filename: "non-existent.md"
        }, { directory: process.cwd() } as any);
        
        expect(result).toContain("File not found");
    });

    test("write_writer_file should create nested directories", async () => {
        const result = await write_writer_file.execute({
            filename: "drafts/draft-1.md",
            content: "Draft content"
        }, { directory: process.cwd() } as any);
        
        expect(result).toBe("Successfully wrote to drafts/draft-1.md");
        
        const content = await read_writer_file.execute({
            filename: "drafts/draft-1.md"
        }, { directory: process.cwd() } as any);
        expect(content).toBe("Draft content");
    });
    
    test("list_writer_files should list nested files", async () => {
        const files = await list_writer_files.execute({}, { directory: process.cwd() } as any);
        // Normalize separators for test
        const normalizedFiles = (files as string).split('\n').map(f => f.replace(/\\/g, '/'));
        expect(normalizedFiles).toContain("drafts/draft-1.md");
    });

    describe("Size limit validation", () => {
        test("read_writer_file should error when file exceeds size limit with env override", async () => {
            // Set a very low size limit (100 bytes)
            process.env.WRITER_MAX_FILE_BYTES = "100";
            
            // Create a file larger than 100 bytes
            const largeContent = "x".repeat(200);
            await write_writer_file.execute({
                filename: "large-file.md",
                content: largeContent
            }, { directory: process.cwd() } as any);
            
            const result = await read_writer_file.execute({
                filename: "large-file.md"
            }, { directory: process.cwd() } as any);
            
            expect(result).toContain("exceeds maximum allowed size");
        });

        test("read_writer_file should succeed when file is under size limit", async () => {
            // Set a reasonable size limit
            process.env.WRITER_MAX_FILE_BYTES = "10000";
            
            const result = await read_writer_file.execute({
                filename: "test.md"
            }, { directory: process.cwd() } as any);
            
            expect(result).not.toContain("exceeds maximum allowed size");
            expect(result).toBe("# Test Content");
        });

        test("read_writer_file should respect default max file size when env not set", async () => {
            delete process.env.WRITER_MAX_FILE_BYTES;
            
            const result = await read_writer_file.execute({
                filename: "test.md"
            }, { directory: process.cwd() } as any);
            
            expect(result).toBe("# Test Content");
        });
    });

    describe("Symlink detection", () => {
        test("read_writer_file should reject symlinks that escape .writer", async () => {
            // Skip this test if we cannot create symlinks
            let canCreateSymlinks = false;
            const testSymlinkPath = path.join(testDir, "test-symlink-check");
            try {
                await fs.symlink(process.cwd(), testSymlinkPath);
                await fs.unlink(testSymlinkPath);
                canCreateSymlinks = true;
            } catch {
                // Cannot create symlinks on this platform (e.g., Windows without privileges)
                console.log("Skipping symlink test: cannot create symlinks on this platform");
            }
            
            if (!canCreateSymlinks) {
                return; // Skip test gracefully
            }
            
            // Create a file outside .writer
            const outsideFile = path.join(process.cwd(), "outside-file.txt");
            await fs.writeFile(outsideFile, "secret content", "utf-8");
            
            try {
                // Create a symlink inside .writer pointing to outside file
                const symlinkPath = path.join(testDir, "symlink-to-outside");
                await fs.symlink(outsideFile, symlinkPath);
                
                const result = await read_writer_file.execute({
                    filename: "symlink-to-outside"
                }, { directory: process.cwd() } as any);
                
                expect(result).toContain("symlink");
                
                // Cleanup symlink
                await fs.unlink(symlinkPath);
            } finally {
                // Cleanup outside file
                await fs.unlink(outsideFile).catch(() => {});
            }
        });

        test("list_writer_files should skip symlinked entries when validation is enabled", async () => {
            // Skip this test if we cannot create symlinks
            let canCreateSymlinks = false;
            const testSymlinkPath = path.join(testDir, "test-symlink-check2");
            try {
                await fs.symlink(process.cwd(), testSymlinkPath);
                await fs.unlink(testSymlinkPath);
                canCreateSymlinks = true;
            } catch {
                console.log("Skipping symlink list test: cannot create symlinks on this platform");
            }
            
            if (!canCreateSymlinks) {
                return; // Skip test gracefully
            }
            
            // Create a file outside .writer
            const outsideFile = path.join(process.cwd(), "outside-file-list.txt");
            await fs.writeFile(outsideFile, "secret content", "utf-8");
            
            try {
                // Create a symlink inside .writer pointing to outside file
                const symlinkPath = path.join(testDir, "symlink-list-test");
                await fs.symlink(outsideFile, symlinkPath);
                
                const result = await list_writer_files.execute({}, { directory: process.cwd() } as any);
                
                // The symlink should not appear in the list
                expect(result).not.toContain("symlink-list-test");
                expect(result).not.toContain("outside-file-list");
                
                // Cleanup symlink
                await fs.unlink(symlinkPath);
            } finally {
                // Cleanup outside file
                await fs.unlink(outsideFile).catch(() => {});
            }
        });
    });

    describe("Directory depth guard", () => {
        test("list_writer_files should throw when scan depth exceeds configured maximum", async () => {
            // Set a very low depth limit
            process.env.WRITER_MAX_SCAN_DEPTH = "2";
            
            // Create deeply nested directories
            const deepDir = path.join(testDir, "level1", "level2", "level3", "level4");
            await fs.mkdir(deepDir, { recursive: true });
            await fs.writeFile(path.join(deepDir, "deep-file.md"), "deep content", "utf-8");
            
            const result = await list_writer_files.execute({}, { directory: process.cwd() } as any);
            
            expect(result).toContain("exceeds maximum allowed depth");
            
            // Cleanup deeply nested directories
            await fs.rm(path.join(testDir, "level1"), { recursive: true, force: true });
        });

        test("list_writer_files should succeed when depth is within limit", async () => {
            // Set a higher depth limit
            process.env.WRITER_MAX_SCAN_DEPTH = "10";
            
            // Create moderately nested directories
            const nestedDir = path.join(testDir, "a", "b");
            await fs.mkdir(nestedDir, { recursive: true });
            await fs.writeFile(path.join(nestedDir, "nested.md"), "nested content", "utf-8");
            
            const result = await list_writer_files.execute({}, { directory: process.cwd() } as any);
            
            expect(result).not.toContain("exceeds maximum allowed depth");
            // Normalize path separators for cross-platform testing
            const normalizedResult = (result as string).replace(/\\/g, '/');
            expect(normalizedResult).toContain("a/b/nested.md");
            
            // Cleanup
            await fs.rm(path.join(testDir, "a"), { recursive: true, force: true });
        });
    });

    describe("Validation environment flags", () => {
        test("should disable all validation when ENABLE_FILE_VALIDATION=false", async () => {
            process.env.ENABLE_FILE_VALIDATION = "false";
            process.env.WRITER_MAX_FILE_BYTES = "100";
            
            // Create a file larger than 100 bytes
            const largeContent = "x".repeat(200);
            await write_writer_file.execute({
                filename: "validation-disabled-test.md",
                content: largeContent
            }, { directory: process.cwd() } as any);
            
            // Should succeed because validation is disabled
            const result = await read_writer_file.execute({
                filename: "validation-disabled-test.md"
            }, { directory: process.cwd() } as any);
            
            expect(result).toBe(largeContent);
        });

        test("should use default values when environment variables are not set", async () => {
            // Clear all environment variables
            delete process.env.ENABLE_FILE_VALIDATION;
            delete process.env.WRITER_MAX_FILE_BYTES;
            delete process.env.WRITER_MAX_SCAN_DEPTH;
            
            // These operations should work with defaults
            const result = await read_writer_file.execute({
                filename: "test.md"
            }, { directory: process.cwd() } as any);
            
            expect(result).toBe("# Test Content");
            
            const files = await list_writer_files.execute({}, { directory: process.cwd() } as any);
            expect(files).toContain("test.md");
        });
    });

    describe("File write retry logic", () => {
        // Import the retry functions directly for testing
        let retryFunctions: typeof import('../../src/tools/file-manager');

        beforeEach(async () => {
            // Re-import to get fresh module with exported functions
            retryFunctions = await import('../../src/tools/file-manager');
        });

        test("isRetryableError should identify retryable error codes", () => {
            const ebusyError = new Error("Resource busy") as NodeJS.ErrnoException;
            ebusyError.code = "EBUSY";
            expect(retryFunctions.isRetryableError(ebusyError)).toBe(true);

            const eagainError = new Error("Resource temporarily unavailable") as NodeJS.ErrnoException;
            eagainError.code = "EAGAIN";
            expect(retryFunctions.isRetryableError(eagainError)).toBe(true);

            const emfileError = new Error("Too many open files") as NodeJS.ErrnoException;
            emfileError.code = "EMFILE";
            expect(retryFunctions.isRetryableError(emfileError)).toBe(true);

            const eaccesError = new Error("Permission denied") as NodeJS.ErrnoException;
            eaccesError.code = "EACCES";
            expect(retryFunctions.isRetryableError(eaccesError)).toBe(false);

            const plainError = new Error("Generic error");
            expect(retryFunctions.isRetryableError(plainError)).toBe(false);

            expect(retryFunctions.isRetryableError(null)).toBe(false);
            expect(retryFunctions.isRetryableError("string")).toBe(false);
        });

        test("calculateRetryDelay should use exponential backoff with jitter", () => {
            const delays: number[] = [];
            
            // Test multiple delays to account for randomness
            for (let i = 0; i < 100; i++) {
                delays.push(retryFunctions.calculateRetryDelay(1, 50));  // Should be ~50ms ±20%
                delays.push(retryFunctions.calculateRetryDelay(2, 50));  // Should be ~100ms ±20%
                delays.push(retryFunctions.calculateRetryDelay(3, 50));  // Should be ~200ms ±20%
            }

            // Check that all delays are within expected ranges (±20%)
            const firstAttemptDelays = delays.filter((_, i) => i % 3 === 0);
            const secondAttemptDelays = delays.filter((_, i) => i % 3 === 1);
            const thirdAttemptDelays = delays.filter((_, i) => i % 3 === 2);

            // 1st attempt: 50ms * 2^0 = 50ms, ±20% = 40ms to 60ms
            expect(Math.min(...firstAttemptDelays)).toBeGreaterThanOrEqual(40);
            expect(Math.max(...firstAttemptDelays)).toBeLessThanOrEqual(60);

            // 2nd attempt: 50ms * 2^1 = 100ms, ±20% = 80ms to 120ms
            expect(Math.min(...secondAttemptDelays)).toBeGreaterThanOrEqual(80);
            expect(Math.max(...secondAttemptDelays)).toBeLessThanOrEqual(120);

            // 3rd attempt: 50ms * 2^2 = 200ms, ±20% = 160ms to 240ms
            expect(Math.min(...thirdAttemptDelays)).toBeGreaterThanOrEqual(160);
            expect(Math.max(...thirdAttemptDelays)).toBeLessThanOrEqual(240);
        });

        test("writeFileWithRetry should retry on EBUSY error and succeed on second attempt", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                if (callCount === 1) {
                    const error = new Error("Resource busy or locked") as NodeJS.ErrnoException;
                    error.code = "EBUSY";
                    throw error;
                }
                // Succeed on second attempt
                return Promise.resolve();
            };

            const testFilePath = path.join(testDir, "retry-test-direct.md");
            
            await retryFunctions.writeFileWithRetry(
                testFilePath,
                "Retry test content",
                { encoding: 'utf-8' },
                mockWriteFile as any,
                true,  // retry enabled
                3      // max retries
            );
            
            expect(callCount).toBe(2); // Should have retried once
        });

        test("writeFileWithRetry should retry on EAGAIN error", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                if (callCount === 1) {
                    const error = new Error("Resource temporarily unavailable") as NodeJS.ErrnoException;
                    error.code = "EAGAIN";
                    throw error;
                }
                return Promise.resolve();
            };

            const testFilePath = path.join(testDir, "eagain-test-direct.md");
            
            await retryFunctions.writeFileWithRetry(
                testFilePath,
                "EAGAIN test content",
                { encoding: 'utf-8' },
                mockWriteFile as any,
                true,
                3
            );
            
            expect(callCount).toBe(2);
        });

        test("writeFileWithRetry should retry on EMFILE error", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                if (callCount === 1) {
                    const error = new Error("Too many open files") as NodeJS.ErrnoException;
                    error.code = "EMFILE";
                    throw error;
                }
                return Promise.resolve();
            };

            const testFilePath = path.join(testDir, "emfile-test-direct.md");
            
            await retryFunctions.writeFileWithRetry(
                testFilePath,
                "EMFILE test content",
                { encoding: 'utf-8' },
                mockWriteFile as any,
                true,
                3
            );
            
            expect(callCount).toBe(2);
        });

        test("writeFileWithRetry should not retry when disabled", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                const error = new Error("Resource busy or locked") as NodeJS.ErrnoException;
                error.code = "EBUSY";
                throw error;
            };

            const testFilePath = path.join(testDir, "no-retry-test-direct.md");
            
            let thrownError: Error | undefined;
            try {
                await retryFunctions.writeFileWithRetry(
                    testFilePath,
                    "No retry test content",
                    { encoding: 'utf-8' },
                    mockWriteFile as any,
                    false, // retry disabled
                    3
                );
            } catch (error) {
                thrownError = error as Error;
            }
            
            expect(callCount).toBe(1); // Should not retry
            expect(thrownError).toBeDefined();
            expect(thrownError?.message).toContain("Resource busy or locked");
        });

        test("writeFileWithRetry should respect max retries limit", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                const error = new Error("Resource busy or locked") as NodeJS.ErrnoException;
                error.code = "EBUSY";
                throw error;
            };

            const testFilePath = path.join(testDir, "max-retries-test-direct.md");
            
            let thrownError: Error | undefined;
            try {
                await retryFunctions.writeFileWithRetry(
                    testFilePath,
                    "Max retries test content",
                    { encoding: 'utf-8' },
                    mockWriteFile as any,
                    true,
                    3  // max retries = 3 (will try up to 3 times)
                );
            } catch (error) {
                thrownError = error as Error;
            }
            
            expect(callCount).toBe(3); // 3 attempts total
            expect(thrownError).toBeDefined();
        });

        test("writeFileWithRetry should not retry on non-retryable errors", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                const error = new Error("Permission denied") as NodeJS.ErrnoException;
                error.code = "EACCES";
                throw error;
            };

            const testFilePath = path.join(testDir, "non-retryable-test-direct.md");
            
            let thrownError: Error | undefined;
            try {
                await retryFunctions.writeFileWithRetry(
                    testFilePath,
                    "Non-retryable test content",
                    { encoding: 'utf-8' },
                    mockWriteFile as any,
                    true,
                    3
                );
            } catch (error) {
                thrownError = error as Error;
            }
            
            expect(callCount).toBe(1); // No retry
            expect(thrownError).toBeDefined();
            expect(thrownError?.message).toContain("Permission denied");
        });

        test("writeFileWithRetry should succeed without retries on happy path", async () => {
            let callCount = 0;
            const mockWriteFile = async () => {
                callCount++;
                return Promise.resolve();
            };

            const testFilePath = path.join(testDir, "happy-path-test-direct.md");
            
            await retryFunctions.writeFileWithRetry(
                testFilePath,
                "Happy path content",
                { encoding: 'utf-8' },
                mockWriteFile as any,
                true,
                3
            );
            
            expect(callCount).toBe(1); // No retries needed
        });

        test("write_writer_file should still work with integrated retry logic", async () => {
            // This test verifies the integration with the actual tool
            const result = await write_writer_file.execute({
                filename: "integration-test.md",
                content: "Integration test content"
            }, { directory: process.cwd() } as any);
            
            expect(result).toBe("Successfully wrote to integration-test.md");
            
            // Verify file was written
            const filePath = path.join(testDir, "integration-test.md");
            const content = await fs.readFile(filePath, 'utf-8');
            expect(content).toBe("Integration test content");
        });
    });
});
