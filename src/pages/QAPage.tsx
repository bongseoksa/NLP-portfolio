import { useState, type FormEvent, type ChangeEvent } from 'react';
import { styled } from '../../styled-system/jsx';
import { useAskQuestion } from '../hooks/useQueries';

const PageContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '800px',
    margin: '0 auto',
  },
});

const Title = styled('h1', {
  base: {
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'text.strong',
    margin: 0,
  },
});

const Description = styled('p', {
  base: {
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'text.subtle',
    margin: 0,
  },
});

const Form = styled('form', {
  base: {
    display: 'flex',
    gap: '0.75rem',
  },
});

const Input = styled('input', {
  base: {
    flex: 1,
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    border: '1px solid',
    borderColor: 'border.normal',
    borderRadius: 'md',
    backgroundColor: 'surface.basic',
    color: 'text.strong',
    outline: 'none',
    transition: 'border-color 0.15s ease',
    _focus: {
      borderColor: 'border.primary',
    },
    _placeholder: {
      color: 'text.subtle',
    },
  },
});

const Button = styled('button', {
  base: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'text.inverse',
    backgroundColor: 'surface.accent',
    border: 'none',
    borderRadius: 'md',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
    _hover: {
      opacity: 0.9,
    },
    _disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

const AnswerCard = styled('div', {
  base: {
    padding: '1.5rem',
    backgroundColor: 'surface.basic',
    borderRadius: 'lg',
    border: '1px solid',
    borderColor: 'border.normal',
    boxShadow: 'sm',
  },
});

const AnswerText = styled('p', {
  base: {
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'text.normal',
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
});

const ErrorText = styled('p', {
  base: {
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: 1.5,
    color: 'surface.error',
    margin: 0,
  },
});

const SourcesSection = styled('div', {
  base: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid',
    borderColor: 'border.subtle',
  },
});

const SourcesTitle = styled('h3', {
  base: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'text.subtle',
    margin: '0 0 0.5rem 0',
  },
});

const SourceItem = styled('div', {
  base: {
    padding: '0.5rem',
    fontSize: '0.75rem',
    color: 'text.subtle',
    backgroundColor: 'surface.secondary',
    borderRadius: 'sm',
    marginBottom: '0.25rem',
  },
});

function QAPage() {
  const [question, setQuestion] = useState('');
  const { mutate, data, isPending, isError } = useAskQuestion();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (question.trim()) {
      mutate(question.trim());
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuestion(e.target.value);
  };

  return (
    <PageContainer>
      <div>
        <Title>GitHub Repository Q&A</Title>
        <Description>
          리포지토리의 커밋 히스토리, 코드 구조에 대해 질문하세요.
        </Description>
      </div>

      <Form onSubmit={handleSubmit}>
        <Input
          type="text"
          value={question}
          onChange={handleChange}
          placeholder="예: 이 프로젝트의 기술 스택은?"
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending || !question.trim()}>
          {isPending ? '처리 중...' : '질문하기'}
        </Button>
      </Form>

      {isError && (
        <AnswerCard>
          <ErrorText>
            질문 처리 중 오류가 발생했습니다. 다시 시도해주세요.
          </ErrorText>
        </AnswerCard>
      )}

      {data && (
        <AnswerCard>
          <AnswerText>{data.answer}</AnswerText>
          {data.sources.length > 0 && (
            <SourcesSection>
              <SourcesTitle>참조 소스 ({data.sources.length}개)</SourcesTitle>
              {data.sources.map((source, index) => (
                <SourceItem key={source.id}>
                  [{index + 1}] {source.type}: {source.content.substring(0, 100)}
                  ...
                  (유사도: {(source.score * 100).toFixed(1)}%)
                </SourceItem>
              ))}
            </SourcesSection>
          )}
        </AnswerCard>
      )}
    </PageContainer>
  );
}

export default QAPage;
