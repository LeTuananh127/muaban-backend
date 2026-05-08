import { Controller, Post, UseInterceptors, UploadedFile, UploadedFiles, UseGuards } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const result = await this.uploadService.uploadFile(file);
    return { url: result.secure_url };
  }

  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  async uploadMultipleImages(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) return { urls: [] };
    
    const urls = await Promise.all(
      files.map(async (file) => {
        const result = await this.uploadService.uploadFile(file);
        return result.secure_url;
      }),
    );
    return { urls };
  }
}
