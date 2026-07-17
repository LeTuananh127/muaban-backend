import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';

interface ChatMessageDto {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
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
}
