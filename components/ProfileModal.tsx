"use client";

import type { FormEvent, RefObject } from "react";
import {
  DUTY_OPTIONS,
  EDUCATION_OFFICES,
  EMPLOYMENT_TYPES,
  SCHOOL_TYPES,
  type DutyCode,
  type TeacherProfile,
} from "@/lib/training-profile";
import { useDialogFocus } from "@/components/useDialogFocus";

interface ProfileModalProps {
  open: boolean;
  year: number;
  value: TeacherProfile;
  hasPreviousProfile: boolean;
  onChange: (value: TeacherProfile) => void;
  onClose: () => void;
  onCopyPrevious: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function ProfileModal({
  open,
  year,
  value,
  hasPreviousProfile,
  onChange,
  onClose,
  onCopyPrevious,
  onSave,
  returnFocusRef,
}: ProfileModalProps) {
  const dialogRef = useDialogFocus(open, open ? "profile" : "", returnFocusRef);

  if (!open) return null;

  const toggleDuty = (duty: DutyCode) => {
    const duties = value.duties.includes(duty)
      ? value.duties.filter((item) => item !== duty)
      : [...value.duties, duty];
    onChange({ ...value, duties });
  };

  return (
    <div
      className="modal-backdrop no-print"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="training-modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <span>MY WORK PROFILE</span>
            <h2 id="profile-modal-title">{year}년 근무 조건 설정</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="근무 조건 창 닫기">
            ×
          </button>
        </div>

        <form onSubmit={onSave}>
          <div className="modal-body">
            <div className="profile-privacy-note">
              <strong>학교명이나 교직원 번호는 수집하지 않아요.</strong>
              <p>연수 분류에 필요한 최소 조건만 저장하며, 추천은 법적 판정을 대신하지 않습니다.</p>
            </div>

            {hasPreviousProfile ? (
              <button className="copy-profile-button" type="button" onClick={onCopyPrevious}>
                ← {year - 1}년 근무 조건 불러오기
              </button>
            ) : null}

            <div className="form-grid">
              <label className="field">
                <span>소속 시·도교육청 *</span>
                <select
                  autoFocus
                  required
                  value={value.educationOffice}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      educationOffice: event.target.value as TeacherProfile["educationOffice"],
                    })
                  }
                >
                  <option value="">선택해 주세요</option>
                  {EDUCATION_OFFICES.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>학교 유형 *</span>
                <select
                  required
                  value={value.schoolType}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      schoolType: event.target.value as TeacherProfile["schoolType"],
                    })
                  }
                >
                  <option value="">선택해 주세요</option>
                  {SCHOOL_TYPES.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>고용 형태 *</span>
                <select
                  required
                  value={value.employmentType}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      employmentType: event.target.value as TeacherProfile["employmentType"],
                    })
                  }
                >
                  <option value="">선택해 주세요</option>
                  {EMPLOYMENT_TYPES.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>

              {value.employmentType === "contract-teacher" ? (
                <label className="field">
                  <span>계약기간 3년 미만 여부</span>
                  <select
                    value={value.contractUnderThreeYears === null ? "" : String(value.contractUnderThreeYears)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        contractUnderThreeYears:
                          event.target.value === "" ? null : event.target.value === "true",
                      })
                    }
                  >
                    <option value="">확인 필요</option>
                    <option value="true">예, 3년 미만</option>
                    <option value="false">아니요</option>
                  </select>
                </label>
              ) : null}

              {value.employmentType === "instructor-other" ? (
                <label className="field">
                  <span>학교와 직접 근로계약 여부</span>
                  <select
                    value={value.directlyEmployed === null ? "" : String(value.directlyEmployed)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        directlyEmployed:
                          event.target.value === "" ? null : event.target.value === "true",
                      })
                    }
                  >
                    <option value="">확인 필요</option>
                    <option value="true">예</option>
                    <option value="false">아니요</option>
                  </select>
                </label>
              ) : null}

              <label className="field">
                <span>학생 대면업무 여부</span>
                <select
                  value={value.studentFacing === null ? "" : String(value.studentFacing)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      studentFacing:
                        event.target.value === "" ? null : event.target.value === "true",
                    })
                  }
                >
                  <option value="">확인 필요</option>
                  <option value="true">예</option>
                  <option value="false">아니요</option>
                </select>
              </label>

              <label className="field">
                <span>개인정보·나이스 취급 여부</span>
                <select
                  value={value.handlesPersonalData === null ? "" : String(value.handlesPersonalData)}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      handlesPersonalData:
                        event.target.value === "" ? null : event.target.value === "true",
                    })
                  }
                >
                  <option value="">확인 필요</option>
                  <option value="true">예</option>
                  <option value="false">아니요</option>
                </select>
              </label>
            </div>

            <fieldset className="duty-fieldset">
              <legend>추가 담당업무 <small>여러 개 선택 가능</small></legend>
              <div className="duty-options">
                {DUTY_OPTIONS.map(([code, label]) => (
                  <label key={code} className={value.duties.includes(code) ? "checked" : ""}>
                    <input
                      type="checkbox"
                      checked={value.duties.includes(code)}
                      onChange={() => toggleDuty(code)}
                    />
                    <span aria-hidden="true">✓</span>
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="modal-footer">
            <span />
            <div>
              <button className="secondary-button" type="button" onClick={onClose}>취소</button>
              <button className="primary-button" type="submit">맞춤 목록 적용</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
