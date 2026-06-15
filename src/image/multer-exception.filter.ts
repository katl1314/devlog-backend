import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

// multer와 관련 에러 핸들링
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? '파일 크기는 10MB를 초과할 수 없습니다.'
        : '파일 업로드 중 오류가 발생했습니다.';
    res.status(400).json({ statusCode: 400, message });
  }
}
