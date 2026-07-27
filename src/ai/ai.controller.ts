import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';

interface ChatMessageDto {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

interface GenerateListingDto {
  title: string;
  category?: string;
  condition?: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: ChatMessageDto) {
    const message = body.message;
    const history = body.history ?? [];
    
    const reply = await this.aiService.getChatResponse(message, history);
    return { reply };
  }

  @Post('generate-listing')
  @HttpCode(HttpStatus.OK)
  async generateListing(@Body() body: GenerateListingDto) {
    return this.aiService.generateListingContent(body.title, body.category, body.condition);
  }
}
