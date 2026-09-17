import 'reflect-metadata';
import '../load-env';
import { createDataSource } from './typeorm.config';

export const AppDataSource = createDataSource();
export default AppDataSource;
