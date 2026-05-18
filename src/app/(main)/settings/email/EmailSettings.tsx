'use client';

import {
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Label,
  Text,
  TextField,
} from '@umami/react-zen';
import { useApi, useLoginQuery, useMessages, useUpdateQuery } from '@/components/hooks';

export function EmailSettings() {
  const { user } = useLoginQuery();
  const { get, useQuery } = useApi();
  const { formatMessage, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, isPending, toast } = useUpdateQuery('/settings/email');
  const { data } = useQuery({
    queryKey: ['settings', 'email'],
    queryFn: async () => get('/settings/email'),
    enabled: !!user?.isAdmin,
  });

  if (!user?.isAdmin) {
    return null;
  }

  const handleSubmit = async (values: any) => {
    await mutateAsync(values, {
      onSuccess: async () => {
        toast(formatMessage(messages.saved));
      },
    });
  };

  return (
    <Column width="480px" gap="6">
      <Column>
        <Label>Emailit</Label>
        <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={data}>
          {data?.apiKeyFromEnv ? (
            <Text color="muted">API key is loaded from `EMAILIT_API_KEY`.</Text>
          ) : (
            <FormField
              label={formatMessage(labels.apiKey)}
              name="apiKey"
              rules={{ required: formatMessage(labels.required) }}
            >
              <TextField autoComplete="off" />
            </FormField>
          )}
          {data?.fromAddressFromEnv ? (
            <Text color="muted">From address is loaded from `EMAILIT_FROM`.</Text>
          ) : (
            <FormField
              label={formatMessage(labels.fromAddress)}
              name="fromAddress"
              rules={{ required: formatMessage(labels.required) }}
            >
              <TextField autoComplete="off" />
            </FormField>
          )}
          <FormField label={formatMessage(labels.replyTo)} name="replyTo">
            <TextField autoComplete="off" />
          </FormField>
          <FormButtons>
            <FormSubmitButton variant="primary" isDisabled={isPending}>
              {formatMessage(labels.save)}
            </FormSubmitButton>
          </FormButtons>
        </Form>
      </Column>
    </Column>
  );
}
