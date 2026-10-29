"""Classroom learning data; additive tables keep existing workspaces intact."""
import uuid
from datetime import datetime, date

from sqlalchemy import String, ForeignKey, JSON, Date, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base
from models.compat import CompatUUID


class AcademyProfile(Base):
    __tablename__ = "academy_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default="student")
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class Classroom(Base):
    __tablename__ = "academy_classrooms"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(100))
    grade: Mapped[str] = mapped_column(String(30))
    join_code: Mapped[str] = mapped_column(String(30), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Enrollment(Base):
    __tablename__ = "academy_enrollments"
    __table_args__ = (UniqueConstraint("classroom_id", "user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("academy_classrooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)


class Material(Base):
    __tablename__ = "academy_materials"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("academy_classrooms.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    filename: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyThread(Base):
    __tablename__ = "academy_threads"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LearningAsset(Base):
    __tablename__ = "academy_assets"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    classroom_id: Mapped[uuid.UUID | None] = mapped_column(CompatUUID, ForeignKey("academy_classrooms.id", ondelete="CASCADE"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    title: Mapped[str] = mapped_column(String(200))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyAttempt(Base):
    __tablename__ = "academy_attempts"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("academy_assets.id", ondelete="CASCADE"), index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademyCard(Base):
    __tablename__ = "academy_cards"
    __table_args__ = (UniqueConstraint("user_id", "asset_id", "card_index"),)
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("academy_assets.id", ondelete="CASCADE"))
    card_index: Mapped[int]
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class AcademySchedule(Base):
    __tablename__ = "academy_schedule"
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="planned")
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class LearningEvent(Base):
    __tablename__ = "academy_events"
    __table_args__ = (UniqueConstraint("user_id", "source"),)
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClassroomAttendance(Base):
    __tablename__ = "academy_attendance"
    __table_args__ = (UniqueConstraint("classroom_id", "user_id", "day"),)
    id: Mapped[uuid.UUID] = mapped_column(CompatUUID, primary_key=True, default=uuid.uuid4)
    classroom_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("academy_classrooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(CompatUUID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="present")
    note: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
