import React, { useState } from 'react';
import {
  Button,
  Input,
  Text,
  Alert,
  FormGroup,
  Label,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter
} from '@goorm-dev/vapor-components';
import AlertCircle from 'lucide-react';

const RoomPasswordModal = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  error
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <div className="flex items-center gap-2">
            <Text typography="heading5">비밀번호 확인</Text>
          </div>
        </ModalHeader>

        <ModalBody>
          {error && (
            <Alert
              color="danger"
              className="mb-4"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </Alert>
          )}

          <FormGroup>
            <Label for="roomPassword">비밀번호</Label>
            <Input
              id="roomPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              disabled={loading}
              autoComplete="off"
            />
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!password || loading}
          >
            {loading ? '확인 중...' : '입장'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

export default RoomPasswordModal;