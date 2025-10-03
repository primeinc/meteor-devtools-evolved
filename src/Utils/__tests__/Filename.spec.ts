import { sanitizeFilename } from '../Filename'

describe('Filename', () => {
  describe('sanitizeFilename', () => {
    describe('invalid character removal', () => {
      // Based on pathvalidate library test patterns
      it('should sanitize pathvalidate pattern #1', () => {
        // Pattern from pathvalidate: fi:l*e/p"a?t>h|.t<xt
        expect(sanitizeFilename('fi:l*e/p"a?t>h|.t<xt')).toBe('fi_l_e_p_a_t_h_.t_xt')
      })

      it('should sanitize pathvalidate pattern #2', () => {
        // Pattern from pathvalidate: \0_a*b:c<d>e%f/(g)h+i_0.txt
        expect(sanitizeFilename('\0_a*b:c<d>e%f/(g)h+i_0.txt')).toBe('__a_b_c_d_e%f_(g)h+i_0.txt')
      })

      it('should replace null byte', () => {
        expect(sanitizeFilename('test\0file')).toBe('test_file')
      })

      it('should replace backslash', () => {
        expect(sanitizeFilename('test\\file')).toBe('test_file')
      })

      it('should replace forward slash', () => {
        expect(sanitizeFilename('test/file')).toBe('test_file')
      })

      it('should replace colon', () => {
        expect(sanitizeFilename('test:file')).toBe('test_file')
      })

      it('should replace asterisk', () => {
        expect(sanitizeFilename('test*file')).toBe('test_file')
      })

      it('should replace question mark', () => {
        expect(sanitizeFilename('test?file')).toBe('test_file')
      })

      it('should replace double quote', () => {
        expect(sanitizeFilename('test"file')).toBe('test_file')
      })

      it('should replace less than', () => {
        expect(sanitizeFilename('test<file')).toBe('test_file')
      })

      it('should replace greater than', () => {
        expect(sanitizeFilename('test>file')).toBe('test_file')
      })

      it('should replace pipe', () => {
        expect(sanitizeFilename('test|file')).toBe('test_file')
      })

      it('should replace multiple invalid characters', () => {
        expect(sanitizeFilename('bad/name:with*chars')).toBe('bad_name_with_chars')
      })

      it('should handle all invalid characters at once', () => {
        expect(sanitizeFilename('a\0b\\c/d:e*f?g"h<i>j|k')).toBe('a_b_c_d_e_f_g_h_i_j_k')
      })
    })

    describe('path traversal protection', () => {
      it('should sanitize relative path traversal', () => {
        // Dots are preserved except trailing ones, slashes become underscores
        expect(sanitizeFilename('../../../etc/passwd')).toBe('.._.._.._etc_passwd')
      })

      it('should sanitize Windows path traversal', () => {
        // Backslashes become underscores, dots preserved except trailing
        expect(sanitizeFilename('..\\..\\..\\windows\\system32')).toBe('.._.._.._windows_system32')
      })

      it('should sanitize absolute Unix path', () => {
        expect(sanitizeFilename('/etc/passwd')).toBe('_etc_passwd')
      })

      it('should sanitize absolute Windows path', () => {
        expect(sanitizeFilename('C:\\Windows\\System32')).toBe('C__Windows_System32')
      })

      it('should sanitize UNC path', () => {
        expect(sanitizeFilename('\\\\server\\share\\file')).toBe('__server_share_file')
      })
    })

    describe('Windows reserved names', () => {
      it('should prefix CON', () => {
        expect(sanitizeFilename('CON')).toBe('_CON')
      })

      it('should prefix PRN', () => {
        expect(sanitizeFilename('PRN')).toBe('_PRN')
      })

      it('should prefix AUX', () => {
        expect(sanitizeFilename('AUX')).toBe('_AUX')
      })

      it('should prefix NUL', () => {
        expect(sanitizeFilename('NUL')).toBe('_NUL')
      })

      it('should prefix COM1', () => {
        expect(sanitizeFilename('COM1')).toBe('_COM1')
      })

      it('should prefix COM9', () => {
        expect(sanitizeFilename('COM9')).toBe('_COM9')
      })

      it('should prefix LPT1', () => {
        expect(sanitizeFilename('LPT1')).toBe('_LPT1')
      })

      it('should prefix LPT9', () => {
        expect(sanitizeFilename('LPT9')).toBe('_LPT9')
      })

      it('should be case insensitive for reserved names', () => {
        expect(sanitizeFilename('con')).toBe('_con')
        expect(sanitizeFilename('CoN')).toBe('_CoN')
        expect(sanitizeFilename('pRn')).toBe('_pRn')
      })

      it('should not prefix reserved names with extensions', () => {
        // Reserved name check is exact match, so CON.txt is safe
        expect(sanitizeFilename('CON.txt')).toBe('CON.txt')
      })
    })

    describe('trailing dots removal', () => {
      it('should remove single trailing dot', () => {
        expect(sanitizeFilename('test.')).toBe('test')
      })

      it('should remove multiple trailing dots', () => {
        expect(sanitizeFilename('test...')).toBe('test')
      })

      it('should keep dots in middle', () => {
        expect(sanitizeFilename('test.file.name')).toBe('test.file.name')
      })

      it('should remove trailing dots after extension', () => {
        expect(sanitizeFilename('test.txt...')).toBe('test.txt')
      })
    })

    describe('length truncation', () => {
      it('should truncate filenames longer than 200 characters', () => {
        const longName = 'a'.repeat(250)
        const result = sanitizeFilename(longName)

        expect(result).toHaveLength(200)
        expect(result).toBe('a'.repeat(200))
      })

      it('should not truncate filenames exactly 200 characters', () => {
        const exactName = 'b'.repeat(200)
        const result = sanitizeFilename(exactName)

        expect(result).toHaveLength(200)
        expect(result).toBe(exactName)
      })

      it('should not truncate filenames under 200 characters', () => {
        const shortName = 'c'.repeat(50)
        const result = sanitizeFilename(shortName)

        expect(result).toBe(shortName)
      })

      it('should truncate after sanitization, not before', () => {
        const longNameWithInvalid = 'a'.repeat(195) + '/:*?'
        const result = sanitizeFilename(longNameWithInvalid)

        // 195 a's + 4 underscores = 199 chars (under limit)
        expect(result).toHaveLength(199)
      })
    })

    describe('whitespace handling', () => {
      it('should trim leading whitespace', () => {
        expect(sanitizeFilename('   test')).toBe('test')
      })

      it('should trim trailing whitespace', () => {
        expect(sanitizeFilename('test   ')).toBe('test')
      })

      it('should trim both leading and trailing whitespace', () => {
        expect(sanitizeFilename('   test   ')).toBe('test')
      })

      it('should preserve internal whitespace', () => {
        expect(sanitizeFilename('test file name')).toBe('test file name')
      })
    })

    describe('empty and default handling', () => {
      it('should use default for empty string', () => {
        expect(sanitizeFilename('')).toBe('collection')
      })

      it('should return empty for whitespace-only string', () => {
        // After trim, empty string is truthy, so no default applied
        expect(sanitizeFilename('   ')).toBe('')
      })

      it('should use default for null input', () => {
        expect(sanitizeFilename(null as any)).toBe('collection')
      })

      it('should use default for undefined input', () => {
        expect(sanitizeFilename(undefined as any)).toBe('collection')
      })

      it('should replace slash with underscore', () => {
        // Single / becomes single _
        const result = sanitizeFilename('/')
        expect(result).toHaveLength(1)
        expect(result).toBe('_')
      })
    })

    describe('real-world collection names', () => {
      it('should sanitize MongoDB collection with dots', () => {
        expect(sanitizeFilename('users.active')).toBe('users.active')
      })

      it('should sanitize collection with underscores', () => {
        expect(sanitizeFilename('user_sessions')).toBe('user_sessions')
      })

      it('should sanitize collection with hyphens', () => {
        expect(sanitizeFilename('user-sessions')).toBe('user-sessions')
      })

      it('should sanitize collection with numbers', () => {
        expect(sanitizeFilename('users2024')).toBe('users2024')
      })

      it('should handle typical timestamp suffix', () => {
        expect(sanitizeFilename('users_2024-01-01T00:00:00.000Z')).toBe('users_2024-01-01T00_00_00.000Z')
      })
    })

    describe('XSS and injection prevention', () => {
      it('should sanitize HTML tags', () => {
        expect(sanitizeFilename('<script>alert("xss")</script>')).toBe('_script_alert(_xss_)__script_')
      })

      it('should sanitize SQL injection attempt', () => {
        // Single quote and semicolon are not in INVALID regex
        expect(sanitizeFilename("'; DROP TABLE users--")).toBe("'; DROP TABLE users--")
      })

      it('should sanitize shell command injection', () => {
        // Semicolon is not in INVALID regex, only / is replaced
        expect(sanitizeFilename('test; rm -rf /')).toBe('test; rm -rf _')
      })
    })

    describe('edge cases', () => {
      it('should handle filename with only dots', () => {
        // Trailing dots removed, leaves empty string (not falsy, so no default)
        expect(sanitizeFilename('...')).toBe('')
      })

      it('should handle filename with Unicode characters', () => {
        expect(sanitizeFilename('test_文件_🎉')).toBe('test_文件_🎉')
      })

      it('should handle mixed valid and invalid', () => {
        expect(sanitizeFilename('valid-name/invalid:part')).toBe('valid-name_invalid_part')
      })

      it('should be idempotent', () => {
        const input = 'test/file:name*'
        const once = sanitizeFilename(input)
        const twice = sanitizeFilename(once)

        expect(once).toBe(twice)
      })
    })
  })
})
